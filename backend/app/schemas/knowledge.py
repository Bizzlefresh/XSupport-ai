import re
from datetime import datetime
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.knowledge import ArticleStatus
from app.schemas.ticket import CategoryOut, PersonOut

_TAG = re.compile(r"<[^>]*>")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def plain(v: str) -> str:
    """Store article text as plain text: strip HTML tags and control characters. The UI also renders it as text."""
    return _CTRL.sub("", _TAG.sub("", v)).strip()


def _need(v: str) -> str:
    v = plain(v)
    if not v:
        raise ValueError("must not be blank")
    return v


class ArticleFields(BaseModel):
    @field_validator("title", "problem_description", "source_note", check_fields=False)
    @classmethod
    def _text(cls, v: str | None) -> str | None:
        return None if v is None else _need(v)

    @field_validator("escalation", check_fields=False)
    @classmethod
    def _esc(cls, v: str | None) -> str | None:
        return (plain(v) or None) if v else None

    @field_validator("steps", check_fields=False)
    @classmethod
    def _steps(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        out = [plain(s) for s in v if plain(s)]
        if not out:
            raise ValueError("at least one step is required")
        if any(len(s) > 1000 for s in out):
            raise ValueError("each step must be 1000 characters or fewer")
        return out

    @field_validator("tags", check_fields=False)
    @classmethod
    def _tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        seen: list[str] = []
        for t in v:
            t = plain(t).lower()[:40]
            if t and t not in seen:
                seen.append(t)
        return seen

    @field_validator("source_url", check_fields=False)
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if not v:
            return None
        u = urlparse(v.strip())
        if u.scheme not in ("http", "https") or not u.netloc:
            raise ValueError("source_url must be an http or https link")
        return v.strip()


class ArticleCreate(ArticleFields):
    title: str = Field(max_length=200)
    category_id: int | None = None
    problem_description: str = Field(max_length=5000)
    steps: list[str] = Field(min_length=1, max_length=30)
    escalation: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=12)
    source_type: Literal["public_link", "internal"] = "internal"
    source_note: str = Field(max_length=1000)
    source_url: str | None = Field(default=None, max_length=500)


class ArticleUpdate(ArticleFields):
    title: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    problem_description: str | None = Field(default=None, max_length=5000)
    steps: list[str] | None = Field(default=None, max_length=30)
    escalation: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = Field(default=None, max_length=12)
    source_note: str | None = Field(default=None, max_length=1000)
    source_url: str | None = Field(default=None, max_length=500)
    status: ArticleStatus | None = None  # approving or archiving is administrator-only


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    title: str
    category: CategoryOut | None
    problem_description: str
    steps: list[str]
    escalation: str | None
    tags: list[str]
    source_type: str
    source_note: str
    source_url: str | None
    status: ArticleStatus
    updated_at: datetime
    created_at: datetime
    updater: PersonOut | None = None


class ArticlePage(BaseModel):
    items: list[ArticleOut]
    total: int
    page: int
    page_size: int
