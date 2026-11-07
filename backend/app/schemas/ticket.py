from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.models.ticket import Priority, TicketStatus


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class PersonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    detail: str
    created_at: datetime
    user: PersonOut | None = None


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    source: str
    external_id: str
    subject: str
    description: str
    category: CategoryOut | None
    priority: Priority
    status: TicketStatus
    assignee: PersonOut | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None
    resolution_summary: str | None

    @computed_field
    @property
    def ticket_number(self) -> str:
        return f"XS-{self.id:05d}"


class TicketDetail(TicketOut):
    activities: list[ActivityOut] = []


class TicketPage(BaseModel):
    items: list[TicketOut]
    total: int
    page: int
    page_size: int


def _clean(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("must not be blank")
    return v


class TicketCreate(BaseModel):
    subject: str = Field(max_length=300)
    description: str = Field(max_length=10000)
    category_id: int | None = None
    priority: Priority = Priority.medium
    assignee_id: int | None = None

    _v = field_validator("subject", "description")(_clean)


class TicketUpdate(BaseModel):
    """Partial update. Only fields present in the request are changed."""

    subject: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=10000)
    category_id: int | None = None
    priority: Priority | None = None
    status: TicketStatus | None = None
    assignee_id: int | None = None
    resolution_summary: str | None = Field(default=None, max_length=5000)


class CommentCreate(BaseModel):
    body: str = Field(max_length=5000)

    _v = field_validator("body")(_clean)
