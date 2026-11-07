from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import ArticleStatus, User
from app.schemas.knowledge import ArticleCreate, ArticleOut, ArticlePage, ArticleUpdate
from app.schemas.retrieval import ArticleHitsOut
from app.services import audit
from app.services import knowledge as svc
from app.services import retrieval as retrieval_svc

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=ArticlePage)
def list_articles(
    q: str | None = Query(None, max_length=200),
    category_id: int | None = None,
    status_: ArticleStatus | None = Query(None, alias="status"),
    tag: str | None = Query(None, max_length=40),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArticlePage:
    rows, total = svc.list_articles(db, q, category_id, status_, tag, page, page_size)
    return ArticlePage(items=rows, total=total, page=page, page_size=page_size)


@router.get("/search", response_model=ArticleHitsOut)
def semantic_search(
    q: str = Query(..., min_length=2, max_length=300),
    method: Literal["lexical", "semantic", "hybrid"] = "hybrid",
    limit: int = Query(5, ge=1, le=10),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ArticleHitsOut:
    """Ranked search over approved articles (drafts are never returned)."""
    return retrieval_svc.search_articles(db, q, method, limit)


@router.post("", response_model=ArticleOut, status_code=status.HTTP_201_CREATED)
def create_article(body: ArticleCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = svc.create(db, body, user)
    audit.record(db, "knowledge.create", user_id=user.id, entity_type="knowledge_article", entity_id=str(a.id))
    return a


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.get_article(db, article_id)


@router.patch("/{article_id}", response_model=ArticleOut)
def update_article(article_id: int, body: ArticleUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a, changed = svc.update(db, article_id, body, user)
    if changed:
        audit.record(db, "knowledge.update", user_id=user.id, entity_type="knowledge_article", entity_id=str(article_id),
                     details={"fields": changed, "status": a.status.value})
    return a
