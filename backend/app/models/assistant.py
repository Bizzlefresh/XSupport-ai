from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utcnow


class AssistantSuggestion(Base):
    """A troubleshooting suggestion shown for a ticket. Stored apart from the ticket; technicians rate it."""

    __tablename__ = "assistant_suggestions"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    assistant_version: Mapped[str] = mapped_column(String(50))
    embedder: Mapped[str] = mapped_column(String(150))
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[float] = mapped_column(Float)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    rating: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # helpful | partly | not_helpful
    rating_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    rated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    rated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    rater = relationship("User", lazy="joined", foreign_keys=[rated_by])
