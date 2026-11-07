import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utcnow


class TicketStatus(enum.StrEnum):
    new = "new"
    open = "open"
    pending = "pending"
    resolved = "resolved"
    closed = "closed"


class Priority(enum.StrEnum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Ticket(Base):
    """Original ticket data only. AI outputs live in separate tables (Phase 3+).

    `category_id` and `priority` are the technician-approved values, never raw model output.
    """

    __tablename__ = "tickets"
    __table_args__ = (
        UniqueConstraint("source", "external_id", name="uq_ticket_source_external"),
        Index("ix_tickets_status_created", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(30), default="synthetic")
    external_id: Mapped[str] = mapped_column(String(100))
    subject: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True, index=True)
    priority: Mapped[Priority] = mapped_column(SAEnum(Priority, name="ticket_priority"), default=Priority.medium)
    status: Mapped[TicketStatus] = mapped_column(SAEnum(TicketStatus, name="ticket_status"), default=TicketStatus.new)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    category = relationship("Category", lazy="joined")
    assignee = relationship("User", lazy="joined", foreign_keys=[assignee_id])
    activities = relationship(
        "TicketActivity", back_populates="ticket", order_by="TicketActivity.created_at, TicketActivity.id",
        cascade="all, delete-orphan",
    )


class TicketActivity(Base):
    __tablename__ = "ticket_activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ticket = relationship("Ticket", back_populates="activities")
    user = relationship("User", lazy="joined")
