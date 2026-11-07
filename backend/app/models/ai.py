import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utcnow


class ReviewDecision(enum.StrEnum):
    accepted = "accepted"
    edited = "edited"
    rejected = "rejected"


class AIPrediction(Base):
    """A model output. Stored apart from the ticket; the ticket's own category changes only when a
    technician accepts or edits it (see TechnicianFeedback)."""

    __tablename__ = "ai_predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="category", index=True)
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(100))
    predicted_label: Mapped[str] = mapped_column(String(100))
    predicted_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    confidence: Mapped[float] = mapped_column(Float)
    alternatives: Mapped[list] = mapped_column(JSON, default=list)
    needs_manual_review: Mapped[bool] = mapped_column(Boolean, default=False)
    threshold: Mapped[float] = mapped_column(Float)
    latency_ms: Mapped[float] = mapped_column(Float)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    predicted_category = relationship("Category", lazy="joined", foreign_keys=[predicted_category_id])
    feedback = relationship("TechnicianFeedback", back_populates="prediction", uselist=False, lazy="joined")


class TechnicianFeedback(Base):
    """The human decision on one prediction (at most one per prediction)."""

    __tablename__ = "technician_feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    prediction_id: Mapped[int] = mapped_column(ForeignKey("ai_predictions.id", ondelete="CASCADE"), unique=True)
    decision: Mapped[ReviewDecision] = mapped_column(SAEnum(ReviewDecision, name="review_decision"))
    final_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    prediction = relationship("AIPrediction", back_populates="feedback")
    final_category = relationship("Category", lazy="joined", foreign_keys=[final_category_id])
    user = relationship("User", lazy="joined")
