from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select

from app.core.config import get_settings
from app.models import AuditLog
from tests.conftest import ADMIN, TECH, login


def test_health_reports_database_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["database"] == "ok"


def test_login_success_returns_token_and_audits(client, db_session):
    h = login(client, TECH)
    me = client.get("/api/auth/me", headers=h).json()
    assert me["email"] == TECH[0] and me["role"] == "technician"
    assert "hashed_password" not in me
    actions = [a.action for a in db_session.scalars(select(AuditLog))]
    assert "auth.login" in actions


def test_login_wrong_password_is_rejected_and_audited(client, db_session):
    r = client.post("/api/auth/login", json={"email": TECH[0], "password": "wrong"})
    assert r.status_code == 401
    assert [a.action for a in db_session.scalars(select(AuditLog))] == ["auth.login_failed"]


def test_login_unknown_and_inactive_users_get_same_error(client):
    a = client.post("/api/auth/login", json={"email": "nobody@xsupport.example.com", "password": "x"})
    b = client.post("/api/auth/login", json={"email": "off@xsupport.example.com", "password": "off-pass-123"})
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_me_requires_authentication(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_expired_token_rejected(client):
    s = get_settings()
    past = datetime.now(UTC) - timedelta(minutes=5)
    token = jwt.encode({"sub": "1", "exp": past}, s.secret_key, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_token_with_wrong_signature_rejected(client):
    token = jwt.encode({"sub": "1", "exp": datetime.now(UTC) + timedelta(minutes=5)},
                       "some-other-secret-that-is-long-enough-123456", algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_role_enforced_server_side(client):
    assert client.get("/api/users").status_code == 401
    assert client.get("/api/users", headers=login(client, TECH)).status_code == 403
    r = client.get("/api/users", headers=login(client, ADMIN))
    assert r.status_code == 200 and len(r.json()) == 3


def test_integration_status_defaults_are_disabled_and_hide_secrets(client):
    r = client.get("/api/integrations/status", headers=login(client, TECH))
    body = r.json()
    assert body["teamdynamix"]["enabled"] is False
    assert body["teamdynamix"]["read_only"] is True
    assert body["external_llm"]["enabled"] is False
    assert "token" not in str(body).lower().replace("teamdynamix_token", "")
    assert client.get("/api/integrations/status").status_code == 401


def test_openapi_docs_exposed(client):
    assert client.get("/docs").status_code == 200
    assert "/api/auth/login" in client.get("/openapi.json").json()["paths"]
