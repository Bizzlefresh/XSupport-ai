"""TeamDynamix adapter tests. Every HTTP exchange is mocked with httpx.MockTransport: no network, no real server."""
import json
import logging

import httpx
import pytest

from app.core.config import get_settings
from app.integrations import registry
from app.integrations.errors import (
    IntegrationAuthError,
    IntegrationError,
    IntegrationMisconfigured,
    IntegrationUnavailable,
    ReadOnlyViolation,
)
from app.integrations.rate_limit import SlidingWindowLimiter
from app.integrations.teamdynamix import TeamDynamixProvider, map_priority, map_status, validate_config
from app.models import Category, Ticket
from tests.conftest import ADMIN, TECH, login

TOKEN = "SECRET-TOKEN-VALUE-123"
BASE = "https://tdx.example.invalid/TDWebApi"
APP = "42"

RAW = {"ID": 1001, "Title": "Printer <b>offline</b>", "Description": "<p>Cannot print</p><script>x</script>", "StatusName": "In Process",
       "PriorityName": "High", "ServiceName": "Hardware and Devices", "CreatedDate": "2026-10-01T09:00:00Z",
       "ModifiedDate": "2026-10-01T10:00:00Z", "CompletedDate": None, "RequestorName": "Jane Student", "ResponsibleFullName": "Tech Person"}


class Fake:
    """Programmable transport: a list of responses/exceptions consumed in order (last one repeats)."""

    def __init__(self, *steps):
        self.steps, self.calls = list(steps), []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        step = self.steps.pop(0) if len(self.steps) > 1 else self.steps[0]
        if isinstance(step, Exception):
            raise step
        return step


def R(status=200, body=None, headers=None):
    return httpx.Response(status, json=body, headers=headers or {})


def make(fake, **kw):
    sleeps = []
    clock = kw.pop("clock", None) or (lambda: 0.0)
    p = TeamDynamixProvider(kw.pop("base", BASE), kw.pop("app_id", APP), kw.pop("token", TOKEN), transport=httpx.MockTransport(fake),
                            sleep=sleeps.append, clock=clock, backoff_base=0.5, rate_limit_calls=1000, **kw)
    return p, sleeps


# ---------- configuration ----------
@pytest.mark.parametrize("kw,needle", [({"base": "http://x.example"}, "https"), ({"base": ""}, "BASE_URL"), ({"base": "https://u:p@x.example"}, "https"),
                                       ({"app_id": "abc"}, "APP_ID"), ({"token": ""}, "TOKEN"), ({"read_only": False}, "not implemented")])
def test_invalid_config_is_rejected_without_leaking_token(kw, needle):
    with pytest.raises(IntegrationMisconfigured) as e:
        make(Fake(R()), **kw)
    assert needle in str(e.value) and TOKEN not in str(e.value)


def test_validate_config_ok():
    assert validate_config(BASE, APP, TOKEN, True) == []


# ---------- read operations and mapping ----------
def test_get_ticket_maps_fields_and_sends_bearer_token():
    f = Fake(R(200, RAW))
    p, _ = make(f)
    t = p.get_ticket(1001)
    assert (t.external_id, t.title, t.status, t.priority, t.category_name) == ("1001", "Printer offline", "open", "high", "Hardware and Devices")
    assert "<" not in t.description and "Cannot print" in t.description
    assert t.created_at.isoformat().startswith("2026-10-01T09:00") and t.completed_at is None
    assert t.requestor is None and t.assignee is None  # people fields dropped by default
    req = f.calls[0]
    assert req.method == "GET" and req.url.path == "/TDWebApi/api/42/tickets/1001"
    assert req.headers["authorization"] == f"Bearer {TOKEN}"


def test_people_fields_only_when_enabled():
    p, _ = make(Fake(R(200, RAW)), include_people=True)
    t = p.get_ticket(1001)
    assert t.requestor == "Jane Student" and t.assignee == "Tech Person"


def test_missing_ticket_is_none_and_not_a_failure():
    p, _ = make(Fake(R(404)))
    assert p.get_ticket(5) is None and p.health.failures == 0


def test_status_and_priority_mapping():
    assert [map_status(x) for x in ("New", "On Hold", "Completed", "Cancelled", "Closed", "In Process", None)] == \
           ["new", "pending", "resolved", "closed", "closed", "open", "open"]
    assert [map_priority(x) for x in ("Urgent", "High", "Medium", "Low", "weird", None)] == ["critical", "high", "medium", "low", "medium", "medium"]


def test_feed_drops_private_entries_and_statuses_and_articles():
    feed = [{"Body": "<p>public</p>", "CreatedDate": "2026-10-01T09:00:00Z", "IsPrivate": False, "CreatedFullName": "A B"},
            {"Body": "internal note", "IsPrivate": True}, {"Body": "", "IsPrivate": False}]
    p, _ = make(Fake(R(200, feed), R(200, [{"Name": "New"}, {"Name": "Closed"}, {}]),
                     R(200, {"Items": [{"ID": 7, "Subject": "How to", "Body": "<i>x</i>", "CategoryName": "Net"}, {"ID": 8}]}),
                     R(200, {"ID": 7, "Subject": "How to", "Body": "x"})))
    c = p.get_ticket_feed(1)
    assert [x.body for x in c] == ["public"] and c[0].author is None
    assert p.list_statuses() == ["New", "Closed"]
    arts = p.search_articles("printer")
    assert len(arts) == 1 and arts[0].title == "How to" and "<" not in arts[0].body
    assert p.get_article(7).external_id == "7"


# ---------- read-only enforcement ----------
@pytest.mark.parametrize("method,path", [("PATCH", "/api/42/tickets/1"), ("POST", "/api/42/tickets"), ("DELETE", "/api/42/tickets/1"),
                                         ("PUT", "/api/42/tickets/1"), ("GET", "/api/99/tickets/1"), ("GET", "/api/42/people/1"),
                                         ("GET", "/api/42/tickets/1/../../x"), ("POST", "/api/42/tickets/search/evil")])
def test_only_allowlisted_reads_reach_the_network(method, path):
    f = Fake(R(200, {}))
    p, _ = make(f)
    with pytest.raises(ReadOnlyViolation):
        p._request(method, path)
    assert f.calls == []


def test_provider_has_no_write_methods():
    p, _ = make(Fake(R()))
    assert not any(hasattr(p, n) for n in ("create_ticket", "update_ticket", "patch_ticket", "delete_ticket", "post_comment"))


def test_redirects_are_not_followed_so_token_cannot_leak():
    f = Fake(R(302, None, {"Location": "https://evil.example/steal"}))
    p, _ = make(f)
    with pytest.raises(IntegrationError):
        p.get_ticket(1)
    assert len(f.calls) == 1


# ---------- pagination ----------
def page(n, start=0):
    return [{"ID": start + i, "Title": f"T{start + i}", "StatusName": "New", "PriorityName": "Low"} for i in range(n)]


def test_pagination_walks_pages_until_short_page():
    f = Fake(R(200, {"Items": page(50, 0)}), R(200, {"Items": page(50, 50)}), R(200, {"Items": page(10, 100)}))
    p, _ = make(f)
    got = list(p.iter_tickets(max_items=1000))
    assert len(got) == 110 and len(f.calls) == 3
    bodies = [json.loads(c.content) for c in f.calls]
    assert [b["PageIndex"] for b in bodies] == [0, 1, 2] and all(b["PageSize"] == 50 for b in bodies)


def test_pagination_respects_max_items_and_criteria():
    f = Fake(R(200, page(50)))
    p, _ = make(f)
    assert len(list(p.iter_tickets(max_items=7, StatusIDs=[1]))) == 7
    assert len(f.calls) == 1 and json.loads(f.calls[0].content)["StatusIDs"] == [1]


def test_pagination_stops_at_page_cap_and_counts_incomplete_records():
    f = Fake(R(200, [{"ID": 1, "Title": "ok"}, {"Title": "no id"}, {"ID": 3}]))  # every page 'full' at page_size=3
    p, _ = make(f, page_size=3)
    got = list(p.iter_tickets(max_items=10**6))
    assert len(f.calls) == 200 and len(got) == 200 and p.last_skipped == 400


# ---------- rate limiting, retry, backoff ----------
def test_sliding_window_limiter_waits():
    now, sleeps = [0.0], []

    def sleep(s):
        sleeps.append(s)
        now[0] += s

    lim = SlidingWindowLimiter(3, 10.0, clock=lambda: now[0], sleep=sleep)
    assert [lim.acquire() for _ in range(3)] == [0.0, 0.0, 0.0]
    assert lim.acquire() == pytest.approx(10.0) and sleeps == [pytest.approx(10.0)]
    with pytest.raises(ValueError):
        SlidingWindowLimiter(0, 1)


def test_provider_throttles_requests():
    now, sleeps = [0.0], []

    def sleep(s):
        sleeps.append(s)
        now[0] += s

    f = Fake(R(200, RAW))
    p = TeamDynamixProvider(BASE, APP, TOKEN, transport=httpx.MockTransport(f), sleep=sleep, clock=lambda: now[0], rate_limit_calls=2,
                            rate_limit_period=60.0)
    for _ in range(3):
        p.get_ticket(1)
    assert len(f.calls) == 3 and sleeps and sleeps[0] == pytest.approx(60.0)


def test_retries_transient_errors_then_succeeds_honouring_retry_after():
    f = Fake(R(503), R(429, None, {"Retry-After": "2"}), R(200, RAW))
    p, sleeps = make(f)
    assert p.get_ticket(1).external_id == "1001"
    assert len(f.calls) == 3 and sleeps[1] == 2.0 and 0.5 <= sleeps[0] <= 1.0
    assert p.health.state == "ready" and p.health.consecutive_failures == 0


def test_retry_after_is_capped():
    p, sleeps = make(Fake(R(429, None, {"Retry-After": "99999"}), R(200, RAW)))
    p.get_ticket(1)
    assert sleeps == [60.0]


def test_gives_up_after_max_retries_with_controlled_error():
    f = Fake(R(503, {"secret": "ticket text"}))
    p, _ = make(f, max_retries=2)
    with pytest.raises(IntegrationUnavailable) as e:
        p.get_ticket(1)
    assert len(f.calls) == 3 and "ticket text" not in str(e.value) and p.health.state == "degraded" and p.health.last_error_kind == "http_503"


def test_timeouts_and_network_errors_retry():
    f = Fake(httpx.ReadTimeout("slow"), httpx.ConnectError("down"), R(200, RAW))
    p, _ = make(f)
    assert p.get_ticket(1) is not None and len(f.calls) == 3


def test_auth_errors_do_not_retry():
    f = Fake(R(401))
    p, _ = make(f)
    with pytest.raises(IntegrationAuthError):
        p.get_ticket(1)
    assert len(f.calls) == 1 and p.health.last_error_kind == "auth"


def test_other_client_errors_and_bad_json_fail_without_retry():
    f = Fake(R(400, {"detail": "ticket text"}))
    p, _ = make(f)
    with pytest.raises(IntegrationError) as e:
        p.get_ticket(1)
    assert "ticket text" not in str(e.value) and len(f.calls) == 1
    p2, _ = make(Fake(httpx.Response(200, content=b"<html>not json")))
    with pytest.raises(IntegrationUnavailable):
        p2.get_ticket(1)


# ---------- circuit breaker ----------
def test_circuit_opens_after_repeated_failures_and_recovers():
    now = [0.0]
    f = Fake(R(503))
    p, _ = make(f, max_retries=0, clock=lambda: now[0])
    for _ in range(5):
        with pytest.raises(IntegrationUnavailable):
            p.get_ticket(1)
    assert p.health.state == "paused"
    calls = len(f.calls)
    with pytest.raises(IntegrationUnavailable, match="paused"):
        p.get_ticket(1)
    assert len(f.calls) == calls  # no request while paused
    now[0] = 61.0
    f.steps = [R(200, RAW)]
    assert p.get_ticket(1) is not None and p.health.state == "ready"


# ---------- secrets ----------
def test_token_never_appears_in_repr_health_or_logs(caplog):
    caplog.set_level(logging.DEBUG)
    p, _ = make(Fake(R(200, RAW)))
    p.get_ticket(1001)
    blob = repr(p) + json.dumps(p.health.__dict__, default=str) + caplog.text
    assert TOKEN not in blob and "1001" not in caplog.text  # ids in logs are masked as {n}


# ---------- application level ----------
@pytest.fixture()
def tdx_env(monkeypatch):
    def apply(**env):
        for k, v in env.items():
            monkeypatch.setenv(k, v)
        get_settings.cache_clear()
    yield apply
    monkeypatch.undo()
    get_settings.cache_clear()
    registry.reset()


def test_app_works_and_everything_is_off_with_default_settings(client):
    h = login(client, TECH)
    s = client.get("/api/integrations/status", headers=h).json()["teamdynamix"]
    assert s["enabled"] is False and s["state"] == "disabled" and s["read_only"] is True
    assert client.get("/api/tickets", headers=h).status_code == 200
    admin = login(client, ADMIN)
    assert client.post("/api/integrations/teamdynamix/test", headers=admin).status_code == 409
    assert client.post("/api/integrations/teamdynamix/import", headers=admin).status_code == 409
    assert client.post("/api/integrations/teamdynamix/test", headers=h).status_code == 403
    assert client.post("/api/integrations/teamdynamix/import", headers=h).status_code == 403
    assert client.post("/api/integrations/teamdynamix/import").status_code == 401


def test_enabled_but_misconfigured_is_reported_and_app_keeps_working(client, tdx_env):
    tdx_env(TEAMDYNAMIX_ENABLED="true", TEAMDYNAMIX_BASE_URL="http://insecure.example")
    h = login(client, TECH)
    s = client.get("/api/integrations/status", headers=h).json()["teamdynamix"]
    assert s["state"] == "misconfigured" and any("https" in r for r in s["reasons"])
    assert client.get("/api/tickets", headers=h).status_code == 200
    r = client.post("/api/integrations/teamdynamix/test", headers=login(client, ADMIN))
    assert r.status_code == 409 and "https" in r.json()["detail"]


def test_write_mode_is_refused(client, tdx_env):
    tdx_env(TEAMDYNAMIX_ENABLED="true", TEAMDYNAMIX_BASE_URL=BASE, TEAMDYNAMIX_APP_ID=APP, TEAMDYNAMIX_TOKEN=TOKEN, TEAMDYNAMIX_READ_ONLY="false")
    s = client.get("/api/integrations/status", headers=login(client, TECH)).json()
    assert s["teamdynamix"]["state"] == "misconfigured" and TOKEN not in json.dumps(s)


def install(tdx_env, fake, **kw):
    tdx_env(TEAMDYNAMIX_ENABLED="true", TEAMDYNAMIX_BASE_URL=BASE, TEAMDYNAMIX_APP_ID=APP, TEAMDYNAMIX_TOKEN=TOKEN)
    p, _ = make(fake, **kw)
    registry.set_override(p)
    return p


def test_connection_test_and_status_health(client, tdx_env):
    install(tdx_env, Fake(R(200, [{"Name": "New"}, {"Name": "Closed"}])))
    admin = login(client, ADMIN)
    assert client.post("/api/integrations/teamdynamix/test", headers=admin).json() == {"ok": True, "statuses_found": 2}
    s = client.get("/api/integrations/status", headers=admin).json()["teamdynamix"]
    assert s["state"] == "ready" and s["requests"] == 1 and s["last_success_at"] and TOKEN not in json.dumps(s)


def test_unavailable_provider_gives_503_and_logs_audit(client, tdx_env, db_session):
    install(tdx_env, Fake(R(503)), max_retries=0)
    r = client.post("/api/integrations/teamdynamix/test", headers=login(client, ADMIN))
    assert r.status_code == 503 and TOKEN not in r.text
    from app.models import AuditLog
    assert any(a.action == "integration.tdx_test" and a.details["ok"] is False for a in db_session.query(AuditLog))


def test_import_is_dry_run_by_default_then_creates_and_is_idempotent(client, tdx_env, db_session):
    db_session.add(Category(name="Hardware and Devices"))
    db_session.commit()
    rows = [dict(RAW, ID=1), dict(RAW, ID=2, ServiceName="Unknown service", StatusName="Completed", CompletedDate="2026-10-02T09:00:00Z"),
            {"ID": 3}]
    install(tdx_env, Fake(R(200, {"Items": rows})))
    admin = login(client, ADMIN)
    dry = client.post("/api/integrations/teamdynamix/import", headers=admin).json()
    assert dry["dry_run"] is True and dry["would_create"] == 2 and dry["skipped_incomplete_records"] == 1
    assert db_session.query(Ticket).filter_by(source="teamdynamix").count() == 0

    real = client.post("/api/integrations/teamdynamix/import?dry_run=false", headers=admin).json()
    assert real["created"] == 2 and real["category_not_matched"] == 1
    t = {x.external_id: x for x in db_session.query(Ticket).filter_by(source="teamdynamix")}
    assert set(t) == {"TDX-1", "TDX-2"} and t["TDX-1"].category.name == "Hardware and Devices" and t["TDX-1"].status.value == "open"
    assert t["TDX-2"].category is None and t["TDX-2"].resolved_at is not None and t["TDX-2"].status.value == "resolved"
    assert "<" not in t["TDX-1"].subject and any("TeamDynamix" in a.detail for a in t["TDX-1"].activities)

    again = client.post("/api/integrations/teamdynamix/import?dry_run=false", headers=admin).json()
    assert again["created"] == 0 and again["already_imported"] == 2


def test_import_failure_writes_nothing(client, tdx_env, db_session):
    install(tdx_env, Fake(R(200, {"Items": page(50)}), R(503)), max_retries=0, page_size=50)
    r = client.post("/api/integrations/teamdynamix/import?dry_run=false&limit=100", headers=login(client, ADMIN))
    assert r.status_code == 503
    assert db_session.query(Ticket).filter_by(source="teamdynamix").count() == 0


def test_import_limit_is_capped_by_setting(client, tdx_env, db_session):
    f = Fake(R(200, page(50)))
    install(tdx_env, f)
    get_settings.cache_clear()
    import os
    os.environ["TEAMDYNAMIX_IMPORT_MAX"] = "5"
    get_settings.cache_clear()
    try:
        r = client.post("/api/integrations/teamdynamix/import?limit=40", headers=login(client, ADMIN)).json()
    finally:
        del os.environ["TEAMDYNAMIX_IMPORT_MAX"]
        get_settings.cache_clear()
    assert r["fetched"] == 5


def test_inspect_script_prints_names_and_types_never_values():
    import sys

    sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "scripts"))
    import inspect_tdx_fields as ins

    secret_ticket = dict(RAW, Description="PRIVATE PATIENT DETAILS", Subject="x")
    del secret_ticket["Title"]
    f = Fake(R(200, {"Items": [secret_ticket]}), R(200, secret_ticket), R(200, [{"Name": "New"}]))
    p, _ = make(f)
    text = "\n".join(ins.inspect(p))
    assert "PRIVATE PATIENT DETAILS" not in text and "Jane Student" not in text
    assert "MISSING expected fields: ['Title']" in text and "Subject" in text and "statuses" in text
    assert len(f.calls) == 3
