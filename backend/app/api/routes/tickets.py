from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Category, Priority, TicketStatus, User
from app.schemas.ticket import (
    CategoryOut,
    CommentCreate,
    PersonOut,
    TicketCreate,
    TicketDetail,
    TicketPage,
    TicketUpdate,
)
from app.services import audit
from app.services import tickets as svc

router = APIRouter(tags=["tickets"])


@router.get("/tickets", response_model=TicketPage)
def list_tickets(
    q: str | None = Query(None, max_length=200),
    status_: TicketStatus | None = Query(None, alias="status"),
    priority: Priority | None = None,
    category_id: int | None = None,
    assignee_id: int | None = None,
    unassigned: bool = False,
    sort: Literal["created_at", "updated_at", "priority", "status"] = "created_at",
    desc: bool = True,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TicketPage:
    stmt = svc.list_query(q, status_, priority, category_id, assignee_id, unassigned)
    rows, total = svc.paginate(db, stmt, sort, desc, page, page_size)
    return TicketPage(items=rows, total=total, page=page, page_size=page_size)


@router.post("/tickets", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
def create_ticket(body: TicketCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = svc.create_ticket(db, body, user)
    audit.record(db, "ticket.create", user_id=user.id, entity_type="ticket", entity_id=str(t.id))
    return t


@router.get("/tickets/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.get_ticket(db, ticket_id)


@router.patch("/tickets/{ticket_id}", response_model=TicketDetail)
def update_ticket(ticket_id: int, body: TicketUpdate, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    t = svc.update_ticket(db, ticket_id, body, user)
    audit.record(db, "ticket.update", user_id=user.id, entity_type="ticket", entity_id=str(ticket_id),
                 details={"fields": sorted(body.model_dump(exclude_unset=True))})
    return t


@router.post("/tickets/{ticket_id}/comments", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
def comment(ticket_id: int, body: CommentCreate, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    return svc.add_comment(db, ticket_id, body.body, user)


@router.get("/categories", response_model=list[CategoryOut])
def categories(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Category).where(Category.is_active).order_by(Category.id)))


@router.get("/assignees", response_model=list[PersonOut])
def assignees(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(User).where(User.is_active).order_by(User.full_name)))
