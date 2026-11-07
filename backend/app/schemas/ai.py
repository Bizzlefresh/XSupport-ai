from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ai import ReviewDecision
from app.schemas.ticket import CategoryOut, PersonOut


class ClassifyRequest(BaseModel):
    """Classify a stored ticket (result is saved for review) or free text (preview only, not saved)."""

    ticket_id: int | None = None
    subject: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=10000)

    @model_validator(mode="after")
    def _one_mode(self) -> "ClassifyRequest":
        text = bool((self.subject or "").strip() or (self.description or "").strip())
        if (self.ticket_id is None) == (not text):
            raise ValueError("Provide either ticket_id, or subject/description text, not both")
        return self


class Candidate(BaseModel):
    label: str
    category_id: int | None  # null if no active category carries this label any more
    probability: float


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    decision: ReviewDecision
    final_category: CategoryOut | None
    reason: str | None
    user: PersonOut
    created_at: datetime


class PredictionOut(BaseModel):
    id: int | None  # null for unsaved previews
    ticket_id: int | None
    kind: str
    model_name: str
    model_version: str
    predicted: Candidate
    confidence: float
    alternatives: list[Candidate]
    needs_manual_review: bool
    threshold: float
    latency_ms: float
    created_at: datetime | None
    review: ReviewOut | None = None
    stored: bool


class ReviewRequest(BaseModel):
    decision: Literal["accepted", "edited", "rejected"]
    final_category_id: int | None = None
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _check(self) -> "ReviewRequest":
        if self.decision == "edited" and self.final_category_id is None:
            raise ValueError("final_category_id is required when editing")
        if self.decision != "edited" and self.final_category_id is not None:
            raise ValueError("final_category_id is only allowed when editing")
        return self
