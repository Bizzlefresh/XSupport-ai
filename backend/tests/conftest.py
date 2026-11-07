import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENVIRONMENT"] = "test"
os.environ["EMBEDDING_PROVIDER"] = "lsa"  # tests never touch the network or a model download
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


@pytest.fixture(scope="session", autouse=True)
def _classifier_artifact():
    from pathlib import Path

    from app.ai.classification import service
    from app.ai.classification.training import train_and_evaluate

    root = Path(__file__).resolve().parents[2]
    if not (service.DEFAULT_DIR / "model.joblib").exists():
        train_and_evaluate(root / "data" / "synthetic" / "tickets.json", service.DEFAULT_DIR, None)
    service.configure(None)


ADMIN = ("admin@xsupport.example.com", "admin-pass-123")
TECH = ("tech@xsupport.example.com", "tech-pass-123")


@pytest.fixture(autouse=True)
def _fresh_integration_registry():
    from app.integrations import registry

    registry.reset()
    yield
    registry.reset()


@pytest.fixture(autouse=True)
def _fresh_retrieval_cache():
    from app.services import retrieval

    retrieval.reset_cache()
    yield
    retrieval.reset_cache()


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
