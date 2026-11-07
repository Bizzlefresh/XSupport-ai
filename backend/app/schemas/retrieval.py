from typing import Literal

from pydantic import BaseModel, Field, model_validator

Method = Literal["lexical", "semantic", "hybrid"]


class RetrievalRequest(BaseModel):
    """Search by stored ticket (it is excluded from its own results) or by free text."""

    ticket_id: int | None = None
    subject: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=10000)
    method: Method = "hybrid"
    limit: int = Field(default=5, ge=1, le=10)

    @model_validator(mode="after")
    def _one_mode(self) -> "RetrievalRequest":
        text = bool((self.subject or "").strip() or (self.description or "").strip())
        if (self.ticket_id is None) == (not text):
            raise ValueError("Provide either ticket_id, or subject/description text, not both")
        return self


class RetrievalMeta(BaseModel):
    method: Method
    embedder: str
    threshold: float | None  # validated weak-match threshold; None = not validated for this setup
    note: str | None = None
    latency_ms: float


class SimilarTicketOut(BaseModel):
    ticket_id: int
    external_id: str | None
    title: str
    score: float
    category: str | None
    status: str
    resolution_summary: str | None


class SimilarTicketsOut(BaseModel):
    meta: RetrievalMeta
    results: list[SimilarTicketOut]


class ArticleHitOut(BaseModel):
    article_id: int
    title: str
    score: float
    category: str | None
    snippet: str
    source_type: str
    # strong/weak only when a threshold was validated for this embedder; otherwise "unvalidated"
    confidence: Literal["strong", "weak", "unvalidated"]


class ArticleHitsOut(BaseModel):
    meta: RetrievalMeta
    results: list[ArticleHitOut]
