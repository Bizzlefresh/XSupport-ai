import json
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app.models import Category
from app.services.incidents import detect_bursts
from tests.conftest import TECH, login

ROOT = Path(__file__).resolve().parents[2]
T0 = datetime(2026, 1, 5, 9, 0)


def at(*minutes):
    return [(i, "Net", T0 + timedelta(minutes=m)) for i, m in enumerate(minutes)]


# ---------- burst rule ----------
def test_burst_found_and_merged():
    b = detect_bursts(at(0, 10, 20, 30, 40, 50))
    assert len(b) == 1 and len(b[0].ticket_ids) == 6 and b[0].category == "Net"


def test_no_burst_when_spread_out_or_too_few():
    assert detect_bursts(at(0, 60, 120, 180, 240, 300)) == []  # 6 tickets, but never 5 within 3 hours
    assert detect_bursts(at(0, 10, 20, 30)) == []


def test_boundary_is_inclusive_and_categories_are_separate():
    assert len(detect_bursts(at(0, 45, 90, 135, 180))) == 1  # exactly 3 hours apart
    mixed = [(i, "A" if i % 2 else "B", T0 + timedelta(minutes=i)) for i in range(8)]
    assert detect_bursts(mixed) == []  # 4 per category


def test_two_separate_bursts_and_validation():
    rows = at(0, 5, 10, 15, 20) + [(10 + i, "Net", T0 + timedelta(days=2, minutes=i)) for i in range(5)]
    assert len(detect_bursts(rows)) == 2
    with pytest.raises(ValueError):
        detect_bursts(rows, min_tickets=1)


# ---------- insights API ----------
@pytest.fixture()
def h(client):
    return login(client, TECH)


@pytest.fixture()
def cat(db_session):
    c = Category(name="Network and Connectivity")
    db_session.add(c)
    db_session.commit()
    return c


def test_insights_requires_auth(client):
    assert client.get("/api/analytics/insights").status_code == 401


def test_insights_empty_database(client, h):
    r = client.get("/api/analytics/insights", headers=h)
    assert r.status_code == 200
    b = r.json()
    assert b["incident_bursts"]["found"] == [] and b["recurring_issues"] == [] and len(b["volume_by_week"]) == 12
    assert all(x["median_hours"] is None for x in b["resolution_by_priority"])


def test_insights_values_match_data(client, h, cat):
    ids = []
    for _ in range(6):
        r = client.post("/api/tickets", json={"subject": "Wifi down in lab", "description": "no wifi at all", "category_id": cat.id,
                                              "priority": "high"}, headers=h)
        ids.append(r.json()["id"])
    client.post("/api/tickets", json={"subject": "Other thing", "description": "something else"}, headers=h)
    client.patch(f"/api/tickets/{ids[0]}", json={"status": "resolved", "resolution_summary": "Fixed"}, headers=h)
    b = client.get("/api/analytics/insights", headers=h).json()
    assert sum(sum(v for k, v in w.items() if k != "week") for w in b["volume_by_week"]) == 7
    assert b["recurring_issues"][0]["subject"] == "Wifi down in lab" and b["recurring_issues"][0]["count"] == 6
    assert b["recurring_issues"][0]["open"] == 5
    assert sum(a["count"] for a in b["backlog_aging"]) == 6  # unresolved only
    found = b["incident_bursts"]["found"]
    assert len(found) == 1 and found[0]["tickets"] == 6 and found[0]["still_open"] == 5 and found[0]["category"] == cat.name
    high = next(x for x in b["resolution_by_priority"] if x["name"] == "high")
    assert high["n"] == 1 and high["median_hours"] is not None
    assert b["ai_use"]["category_review"]["predictions"] == 0 and b["ai_use"]["assistant"]["suggestions"] == 0


def test_resolved_without_timestamp_is_reported(client, h, cat, db_session):
    from app.models import Ticket
    t = client.post("/api/tickets", json={"subject": "x", "description": "y"}, headers=h).json()
    client.patch(f"/api/tickets/{t['id']}", json={"status": "resolved", "resolution_summary": "ok"}, headers=h)
    row = db_session.get(Ticket, t["id"])
    row.resolved_at = None
    db_session.commit()
    b = client.get("/api/analytics/insights", headers=h).json()
    assert b["data_quality"]["resolved_without_timestamp"] == 1
    assert all(x["n"] == 0 for x in b["resolution_by_priority"])


def test_weeks_parameter_validated(client, h):
    assert client.get("/api/analytics/insights?weeks=2", headers=h).status_code == 422
    assert len(client.get("/api/analytics/insights?weeks=8", headers=h).json()["volume_by_week"]) == 8


# ---------- reports ----------
def test_incident_report_reproducible(tmp_path):
    out = tmp_path / "i.json"
    subprocess.run([sys.executable, str(ROOT / "scripts/evaluate_incidents.py"), "--out", str(out)], check=True, capture_output=True)
    assert json.loads(out.read_text()) == json.loads((ROOT / "data/evaluation/incident_report.json").read_text())


def test_results_document_is_up_to_date():
    r = subprocess.run([sys.executable, str(ROOT / "scripts/build_results.py"), "--check"], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
    text = (ROOT / "docs/results.md").read_text()
    assert "do not establish accuracy" in text.lower() or "do **not** establish accuracy" in text.lower()
    assert "What has not been measured" in text
