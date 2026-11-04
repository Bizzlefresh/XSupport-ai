import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production-use-0123456789"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Role, User

ADMIN = ("admin@xsupport.example.com", "admin-pass-123")
TECH = ("tech@xsupport.example.com", "tech-pass-123")


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as s:
        s.add(User(email=ADMIN[0], full_name="Admin", role=Role.admin, hashed_password=hash_password(ADMIN[1])))
        s.add(User(email=TECH[0], full_name="Tech", role=Role.technician, hashed_password=hash_password(TECH[1])))
        s.add(User(email="off@xsupport.example.com", full_name="Off", role=Role.technician,
                   hashed_password=hash_password("off-pass-123"), is_active=False))
        s.commit()
        yield s


@pytest.fixture()
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, creds) -> dict:
    r = client.post("/api/auth/login", json={"email": creds[0], "password": creds[1]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
