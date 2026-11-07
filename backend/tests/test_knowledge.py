import json
from pathlib import Path

import pytest

from app.models import ArticleStatus, Category, KnowledgeArticle
from tests.conftest import ADMIN, TECH, login

ROOT = Path(__file__).resolve().parents[2]
NEW = {"title": "Reset a classroom podium", "problem_description": "Podium PC is frozen.",
       "steps": ["Restart the PC.", "Check cables."], "tags": ["Podium", "podium", "AV"], "source_note": "Written by a technician."}


@pytest.fixture()
def cat(db_session):
    c = Category(name="Classroom and AV Support")
    db_session.add(c)
    db_session.commit()
    return c


@pytest.fixture()
def tech(client):
    return login(client, TECH)


@pytest.fixture()
def admin(client):
    return login(client, ADMIN)


def test_requires_auth(client):
    assert client.get("/api/knowledge").status_code == 401
    assert client.get("/api/knowledge/search?q=printer").status_code == 401


def test_create_is_always_draft_and_normalises(client, tech, cat):
    r = client.post("/api/knowledge", json=NEW | {"category_id": cat.id, "status": "approved"}, headers=tech)
    assert r.status_code == 201, r.text
    a = r.json()
    assert a["status"] == "draft"  # client-supplied status is ignored
    assert a["tags"] == ["podium", "av"]  # lower-cased and de-duplicated
    assert a["source_type"] == "internal" and a["slug"].startswith("kb-")


def test_html_is_stripped_from_text(client, tech):
    r = client.post("/api/knowledge", json=NEW | {"title": "<script>alert(1)</script>Fix", "steps": ["<b>Do</b> it"]}, headers=tech)
    assert r.status_code == 201
    assert r.json()["title"] == "alert(1)Fix" and r.json()["steps"] == ["Do it"]


@pytest.mark.parametrize("patch", [{"steps": []}, {"steps": ["", "  "]}, {"title": "   "}, {"source_url": "javascript:alert(1)"},
                                   {"source_type": "public_link"}, {"category_id": 9999}])
def test_validation(client, tech, patch):
    assert client.post("/api/knowledge", json=NEW | patch, headers=tech).status_code == 422


def test_only_admin_can_approve(client, tech, admin):
    aid = client.post("/api/knowledge", json=NEW, headers=tech).json()["id"]
    assert client.patch(f"/api/knowledge/{aid}", json={"status": "approved"}, headers=tech).status_code == 403
    r = client.patch(f"/api/knowledge/{aid}", json={"status": "approved"}, headers=admin)
    assert r.status_code == 200 and r.json()["status"] == "approved"


def test_technician_edit_of_approved_article_returns_it_to_draft(client, tech, admin):
    aid = client.post("/api/knowledge", json=NEW, headers=tech).json()["id"]
    client.patch(f"/api/knowledge/{aid}", json={"status": "approved"}, headers=admin)
    r = client.patch(f"/api/knowledge/{aid}", json={"steps": ["New step."]}, headers=tech)
    assert r.json()["status"] == "draft" and r.json()["steps"] == ["New step."]
    # an admin edit keeps the status
    client.patch(f"/api/knowledge/{aid}", json={"status": "approved"}, headers=admin)
    assert client.patch(f"/api/knowledge/{aid}", json={"title": "Better title"}, headers=admin).json()["status"] == "approved"


def test_list_search_filters_and_hides_archived(client, tech, admin):
    a = client.post("/api/knowledge", json=NEW, headers=tech).json()["id"]
    client.post("/api/knowledge", json=NEW | {"title": "Printer jam", "tags": ["printer"]}, headers=tech)
    assert client.get("/api/knowledge?q=printer", headers=tech).json()["total"] == 1
    assert client.get("/api/knowledge?tag=podium", headers=tech).json()["total"] == 1
    assert client.get("/api/knowledge?q=%25", headers=tech).json()["total"] == 0  # LIKE wildcard is escaped
    client.patch(f"/api/knowledge/{a}", json={"status": "archived"}, headers=admin)
    assert client.get("/api/knowledge", headers=tech).json()["total"] == 1
    assert client.get("/api/knowledge?status=archived", headers=tech).json()["total"] == 1


def test_missing_article_and_audit(client, tech, admin, db_session):
    assert client.get("/api/knowledge/999", headers=tech).status_code == 404
    aid = client.post("/api/knowledge", json=NEW, headers=tech).json()["id"]
    client.patch(f"/api/knowledge/{aid}", json={"status": "approved"}, headers=admin)
    from app.models import AuditLog
    actions = [a.action for a in db_session.query(AuditLog).all()]
    assert "knowledge.create" in actions and "knowledge.update" in actions


def test_seed_articles_are_original_and_labelled():
    arts = json.loads((ROOT / "data/knowledge/articles.json").read_text())["articles"]
    assert len(arts) >= 24 and len({a["slug"] for a in arts}) == len(arts)
    for a in arts:
        assert a["source_type"] == "original_sample" and "Original sample" in a["source_note"]
        assert a["steps"] and a["status"] == "approved"
    labels = json.loads((ROOT / "data/knowledge/relevance_labels.json").read_text())["family_to_articles"]
    slugs = {a["slug"] for a in arts}
    assert all(s in slugs for v in labels.values() for s in v)


def test_model_enum_default(db_session):
    a = KnowledgeArticle(slug="x", title="t", problem_description="p", steps=["s"], source_note="n")
    db_session.add(a)
    db_session.commit()
    assert a.status == ArticleStatus.draft
