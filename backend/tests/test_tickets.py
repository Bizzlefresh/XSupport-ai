import pytest

from app.models import Category
from tests.conftest import ADMIN, TECH, login


@pytest.fixture()
def cats(db_session):
    cs = [Category(name="Network"), Category(name="Accounts"), Category(name="Retired", is_active=False)]
    db_session.add_all(cs)
    db_session.commit()
    return cs


@pytest.fixture()
def h(client):
    return login(client, TECH)


def make(client, h, **kw):
    body = {"subject": "Wi-Fi drops", "description": "Keeps disconnecting", **kw}
    r = client.post("/api/tickets", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_requires_auth(client):
    assert client.get("/api/tickets").status_code == 401
    assert client.post("/api/tickets", json={"subject": "a", "description": "b"}).status_code == 401
    assert client.get("/api/analytics/overview").status_code == 401


def test_create_logs_activity_and_ids(client, h):
    t = make(client, h)
    assert t["status"] == "new" and t["priority"] == "medium"
    assert t["ticket_number"] == f"XS-{t['id']:05d}"
    assert t["external_id"].startswith("LOCAL-") and t["source"] == "synthetic"
    assert [a["kind"] for a in t["activities"]] == ["created"]


def test_validation(client, h, cats):
    assert client.post("/api/tickets", json={"subject": "  ", "description": "x"}, headers=h).status_code == 422
    bad = {"subject": "x", "description": "y", "priority": "urgent"}
    assert client.post("/api/tickets", json=bad, headers=h).status_code == 422
    r = client.post("/api/tickets", json={"subject": "x", "description": "y", "category_id": cats[2].id}, headers=h)
    assert r.status_code == 422  # inactive category
    r = client.post("/api/tickets", json={"subject": "x", "description": "y", "assignee_id": 9999}, headers=h)
    assert r.status_code == 422


def test_update_records_each_change(client, h, cats):
    t = make(client, h)
    r = client.patch(f"/api/tickets/{t['id']}", headers=h,
                     json={"priority": "high", "category_id": cats[0].id, "status": "open"})
    assert r.status_code == 200
    kinds = [a["kind"] for a in r.json()["activities"]]
    assert {"priority", "category", "status"} <= set(kinds)
    # no-op update adds no history
    n = len(r.json()["activities"])
    r2 = client.patch(f"/api/tickets/{t['id']}", headers=h, json={"priority": "high"})
    assert len(r2.json()["activities"]) == n


def test_resolution_timestamp_set_and_cleared_on_reopen(client, h):
    t = make(client, h)
    r = client.patch(f"/api/tickets/{t['id']}", headers=h, json={"status": "resolved"}).json()
    assert r["resolved_at"] is not None
    r = client.patch(f"/api/tickets/{t['id']}", headers=h, json={"status": "open"}).json()
    assert r["resolved_at"] is None


def test_filter_search_sort_paginate(client, h, cats):
    make(client, h, subject="Printer jam", description="paper stuck", priority="low")
    make(client, h, subject="VPN down", description="cannot connect", priority="critical", category_id=cats[0].id)
    for i in range(3):
        make(client, h, subject=f"Misc {i}", description="other")
    assert client.get("/api/tickets?q=vpn", headers=h).json()["total"] == 1
    assert client.get("/api/tickets?q=%25", headers=h).json()["total"] == 0  # LIKE wildcard escaped
    assert client.get("/api/tickets?priority=critical", headers=h).json()["total"] == 1
    assert client.get(f"/api/tickets?category_id={cats[0].id}", headers=h).json()["total"] == 1
    assert client.get("/api/tickets?unassigned=true", headers=h).json()["total"] == 5
    page = client.get("/api/tickets?page=2&page_size=2", headers=h).json()
    assert page["total"] == 5 and len(page["items"]) == 2
    assert client.get("/api/tickets?page_size=500", headers=h).status_code == 422
    assert client.get("/api/tickets?sort=password", headers=h).status_code == 422


def test_comment_and_404(client, h):
    t = make(client, h)
    r = client.post(f"/api/tickets/{t['id']}/comments", json={"body": "Called user"}, headers=h)
    assert r.status_code == 201 and r.json()["activities"][-1]["detail"] == "Called user"
    assert client.get("/api/tickets/99999", headers=h).status_code == 404


def test_dashboard_numbers_match_data(client, db_session):
    h = login(client, ADMIN)
    a = make(client, h, priority="critical")
    b = make(client, h, priority="low")
    c = make(client, h, priority="high")
    client.patch(f"/api/tickets/{a['id']}", headers=h, json={"status": "resolved"})
    client.patch(f"/api/tickets/{b['id']}", headers=h, json={"status": "pending"})
    o = client.get("/api/analytics/overview?days=7", headers=h).json()
    assert o["totals"] == {"total": 3, "open": 1, "pending": 1, "resolved": 1, "high_priority_open": 1}
    assert o["resolution"]["tickets_counted"] == 1
    assert sum(d["created"] for d in o["trend"]) == 3 and len(o["trend"]) == 7
    assert o["by_priority"] == {"critical": 1, "low": 1, "high": 1}
    assert c["id"]


def test_resolution_time_ignores_invalid_records(client, db_session):
    from datetime import UTC, datetime, timedelta

    from app.models import Ticket
    now = datetime.now(UTC)
    db_session.add_all([
        Ticket(source="synthetic", external_id="a", subject="ok", description="d", status="resolved",
               created_at=now - timedelta(hours=10), resolved_at=now - timedelta(hours=8)),   # 2h valid
        Ticket(source="synthetic", external_id="b", subject="no ts", description="d", status="resolved",
               created_at=now, resolved_at=None),                                              # missing
        Ticket(source="synthetic", external_id="c", subject="neg", description="d", status="closed",
               created_at=now, resolved_at=now - timedelta(hours=5)),                          # negative
    ])
    db_session.commit()
    o = client.get("/api/analytics/overview", headers=login(client, TECH)).json()
    assert o["resolution"] == {"average_hours": 2.0, "tickets_counted": 1}


def test_source_external_id_unique(db_session):
    from sqlalchemy.exc import IntegrityError

    from app.models import Ticket
    db_session.add(Ticket(source="synthetic", external_id="X", subject="s", description="d"))
    db_session.commit()
    db_session.add(Ticket(source="synthetic", external_id="X", subject="s2", description="d"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
    db_session.add(Ticket(source="teamdynamix", external_id="X", subject="s3", description="d"))
    db_session.commit()  # same id from another source is allowed
