import re
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import Session

from app.models import ArticleStatus, Category, KnowledgeArticle, Role, User
from app.schemas.knowledge import ArticleCreate, ArticleUpdate

CONTENT_FIELDS = ("title", "category_id", "problem_description", "steps", "escalation", "tags", "source_note", "source_url")


def slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or "article"
    return f"kb-{base}"


def get_article(db: Session, article_id: int) -> KnowledgeArticle:
    a = db.get(KnowledgeArticle, article_id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    return a


def _check_category(db: Session, category_id: int | None) -> None:
    if category_id is not None:
        c = db.get(Category, category_id)
        if c is None or not c.is_active:
            raise HTTPException(422, "Unknown or inactive category")


def _require_source(source_type: str, url: str | None) -> None:
    if source_type == "public_link" and not url:
        raise HTTPException(422, "A public-link article needs a source_url")


def create(db: Session, data: ArticleCreate, user: User) -> KnowledgeArticle:
    _check_category(db, data.category_id)
    _require_source(data.source_type, data.source_url)
    slug, n = slugify(data.title), 1
    while db.scalar(select(KnowledgeArticle.id).where(KnowledgeArticle.slug == slug)):
        n += 1
        slug = f"{slugify(data.title)}-{n}"
    now = datetime.now(UTC)
    a = KnowledgeArticle(
        slug=slug, title=data.title, category_id=data.category_id, problem_description=data.problem_description,
        steps=data.steps, escalation=data.escalation, tags=data.tags, source_type=data.source_type,
        source_note=data.source_note, source_url=data.source_url,
        status=ArticleStatus.draft,  # new articles always start as drafts and need an administrator
        created_by=user.id, updated_by=user.id, created_at=now, updated_at=now)
    db.add(a)
    db.commit()
    return get_article(db, a.id)


def update(db: Session, article_id: int, data: ArticleUpdate, user: User) -> tuple[KnowledgeArticle, list[str]]:
    a = get_article(db, article_id)
    ch = data.model_dump(exclude_unset=True)
    is_admin = user.role == Role.admin
    if "status" in ch and ch["status"] is None:
        raise HTTPException(422, "status cannot be null")
    if "status" in ch and ch["status"] != a.status and not is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only administrators can approve or archive articles")
    if "category_id" in ch:
        _check_category(db, ch["category_id"])
    if "source_url" in ch and a.source_type == "public_link" and not ch["source_url"]:
        raise HTTPException(422, "A public-link article needs a source_url")

    changed = []
    content_changed = False
    for f in CONTENT_FIELDS:
        if f in ch and ch[f] != getattr(a, f):
            if ch[f] is None and f in ("title", "problem_description", "steps", "tags", "source_note"):
                raise HTTPException(422, f"{f} cannot be empty")
            setattr(a, f, ch[f])
            changed.append(f)
            content_changed = True
    if "status" in ch and ch["status"] != a.status:
        a.status = ch["status"]
        changed.append("status")
    elif content_changed and not is_admin and a.status == ArticleStatus.approved:
        a.status = ArticleStatus.draft  # edited content must be re-approved before retrieval uses it
        changed.append("status")
    if changed:
        a.updated_by, a.updated_at = user.id, datetime.now(UTC)
        db.commit()
        db.refresh(a)
    return a, changed


def list_articles(db: Session, q: str | None, category_id: int | None, status_: ArticleStatus | None,
                  tag: str | None, page: int, page_size: int):
    stmt = select(KnowledgeArticle)
    stmt = stmt.where(KnowledgeArticle.status == status_) if status_ else stmt.where(KnowledgeArticle.status != ArticleStatus.archived)
    if q:
        tags_text = cast(KnowledgeArticle.tags, String)
        stmt = stmt.where(or_(KnowledgeArticle.title.icontains(q, autoescape=True),
                              KnowledgeArticle.problem_description.icontains(q, autoescape=True),
                              tags_text.icontains(q, autoescape=True)))
    if category_id:
        stmt = stmt.where(KnowledgeArticle.category_id == category_id)
    if tag:
        stmt = stmt.where(cast(KnowledgeArticle.tags, String).contains(f'"{tag.lower()}"', autoescape=True))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(stmt.order_by(KnowledgeArticle.updated_at.desc(), KnowledgeArticle.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).unique().all()
    return rows, total
