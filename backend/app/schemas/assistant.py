from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.knowledge import plain
from app.schemas.retrieval import RetrievalMeta

Rating = Literal["helpful", "partly", "not_helpful"]


class AssistRequest(BaseModel):
    """Suggest troubleshooting for a stored ticket (saved for rating) or free text (preview, not saved)."""

    ticket_id: int | None = None
    subject: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def _one_mode(self) -> "AssistRequest":
        text = bool((self.subject or "").strip() or (self.description or "").strip())
        if (self.ticket_id is None) == (not text):
            raise ValueError("Provide either ticket_id, or subject/description text, not both")
        return self


class StepSource(BaseModel):
    article_id: int
    title: str
    score: float
    confidence: Literal["strong", "weak", "unvalidated"]
    category: str | None
    steps: list[str]
    escalation: str | None
    source_type: str


class PastResolutionOut(BaseModel):
    ticket_id: int
    external_id: str | None
    title: str
    score: float
    resolution_summary: str


class SuggestionOut(BaseModel):
    id: int | None  # None for an unsaved free-text preview
    ticket_id: int | None
    status: Literal["grounded", "unvalidated", "insufficient_evidence", "no_evidence"]
    articles: list[StepSource]
    past_resolutions: list[PastResolutionOut]
    questions: list[str]
    notes: list[str]
    assistant_version: str
    meta: RetrievalMeta
    created_at: datetime | None
    rating: Rating | None = None
    rating_comment: str | None = None
    stored: bool


class FeedbackRequest(BaseModel):
    rating: Rating
    comment: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _clean(self) -> "FeedbackRequest":
        self.comment = (plain(self.comment) or None) if self.comment else None
        return self
