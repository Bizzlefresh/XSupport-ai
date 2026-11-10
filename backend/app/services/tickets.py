import re
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Category, Ticket, TicketActivity, TicketStatus, User
from app.models.ticket import Priority
from app.schemas.ticket import TicketCreate, TicketUpdate

# Priority and status sort by an explicit rank, not by the stored value: text order (SQLite) and native enum
# order (PostgreSQL) disagree, and neither puts critical above high. Descending priority = most urgent first;
# ascending status = workflow order (new, open, pending, resolved, closed).
_PRIORITY_RANK = case({Priority.critical: 3, Priority.high: 2, Priority.medium: 1, Priority.low: 0}, value=Ticket.priority)
_STATUS_RANK = case({s: i for i, s in enumerate(TicketStatus)}, value=Ticket.status)
SORTS = {
    "created_at": Ticket.created_at,
    "updated_at": Ticket.updated_at,
    "priority": _PRIORITY_RANK,
    "status": _STATUS_RANK,
}
_TICKET_NUMBER = re.compile(r"^(?:xs-?)?(\d{1,9})$", re.IGNORECASE)
RESOLVED_STATES = {TicketStatus.resolved, TicketStatus.closed}
UNPROCESSABLE = 422


def log_activity(db: Session, ticket: Ticket, user: User | None, kind: str, detail: str) -> None:
    db.add(TicketActivity(ticket=ticket, user_id=user.id if user else None, kind=kind, detail=detail))


def _validate_refs(db: Session, category_id: int | None, assignee_id: int | None) -> None:
    if category_id is not None:
        cat = db.get(Category, category_id)
        if cat is None or not cat.is_active:
            raise HTTPException(UNPROCESSABLE, "Unknown or inactive category")
    if assignee_id is not None:
        u = db.get(User, assignee_id)
        if u is None or not u.is_active:
            raise HTTPException(UNPROCESSABLE, "Unknown or inactive assignee")


def get_ticket(db: Session, ticket_id: int) -> Ticket:
    t = db.scalar(select(Ticket).where(Ticket.id == ticket_id).options(selectinload(Ticket.activities)))
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return t


def create_ticket(db: Session, data: TicketCreate, user: User) -> Ticket:
    _validate_refs(db, data.category_id, data.assignee_id)
    t = Ticket(
        source="synthetic", external_id="pending", subject=data.subject, description=data.description,
        category_id=data.category_id, priority=data.priority, assignee_id=data.assignee_id,
        status=TicketStatus.new,
    )
    db.add(t)
    db.flush()
    t.external_id = f"LOCAL-{t.id:06d}"  # created in-app; distinct from generated SYN- ids
    log_activity(db, t, user, "created", "Ticket created")
    db.commit()
    return get_ticket(db, t.id)


def update_ticket(db: Session, ticket_id: int, data: TicketUpdate, user: User) -> Ticket:
    t = get_ticket(db, ticket_id)
    ch = data.model_dump(exclude_unset=True)
    _validate_refs(db, ch.get("category_id"), ch.get("assignee_id"))

    for field in ("subject", "description"):
        if ch.get(field) is not None and ch[field].strip() and ch[field].strip() != getattr(t, field):
            setattr(t, field, ch[field].strip())
            log_activity(db, t, user, "edited", f"{field} edited")
    if ch.get("priority") is not None and ch["priority"] != t.priority:
        log_activity(db, t, user, "priority", f"Priority {t.priority.value} -> {ch['priority'].value}")
        t.priority = ch["priority"]
    if "category_id" in ch and ch["category_id"] != t.category_id:
        new = db.get(Category, ch["category_id"]) if ch["category_id"] else None
        log_activity(db, t, user, "category",
             f"Category {t.category.name if t.category else 'none'} -> {new.name if new else 'none'}")
        t.category_id, t.category = ch["category_id"], new
    if "assignee_id" in ch and ch["assignee_id"] != t.assignee_id:
        new_u = db.get(User, ch["assignee_id"]) if ch["assignee_id"] else None
        log_activity(db, t, user, "assignee",
             f"Assigned {t.assignee.full_name if t.assignee else 'nobody'} -> {new_u.full_name if new_u else 'nobody'}")
        t.assignee_id, t.assignee = ch["assignee_id"], new_u
    if "resolution_summary" in ch and (ch["resolution_summary"] or None) != t.resolution_summary:
        t.resolution_summary = (ch["resolution_summary"] or "").strip() or None
        log_activity(db, t, user, "resolution", "Resolution summary updated")
    if ch.get("status") is not None and ch["status"] != t.status:
        new_status = ch["status"]
        log_activity(db, t, user, "status", f"Status {t.status.value} -> {new_status.value}")
        if new_status in RESOLVED_STATES and t.status not in RESOLVED_STATES:
            t.resolved_at = datetime.now(UTC)
        elif new_status not in RESOLVED_STATES:
            t.resolved_at = None  # reopened: earlier resolution time is no longer valid
        t.status = new_status
    t.updated_at = datetime.now(UTC)
    db.commit()
    return get_ticket(db, ticket_id)


def add_comment(db: Session, ticket_id: int, body: str, user: User) -> Ticket:
    t = get_ticket(db, ticket_id)
    log_activity(db, t, user, "comment", body)
    t.updated_at = datetime.now(UTC)
    db.commit()
    return get_ticket(db, ticket_id)


def list_query(q: str | None, status_: TicketStatus | None, priority: Priority | None,
               category_id: int | None, assignee_id: int | None, unassigned: bool) -> Select:
    stmt = select(Ticket)
    if q:
        conds = [Ticket.subject.icontains(q, autoescape=True),
                 Ticket.description.icontains(q, autoescape=True),
                 Ticket.external_id.icontains(q, autoescape=True)]
        # The UI shows ticket numbers as XS-00042 (derived from the id), so accept that form, XS42, or bare digits.
        if m := _TICKET_NUMBER.match(q.strip()):
            conds.append(Ticket.id == int(m.group(1)))
        stmt = stmt.where(or_(*conds))
    if status_:
        stmt = stmt.where(Ticket.status == status_)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if category_id:
        stmt = stmt.where(Ticket.category_id == category_id)
    if assignee_id:
        stmt = stmt.where(Ticket.assignee_id == assignee_id)
    if unassigned:
        stmt = stmt.where(Ticket.assignee_id.is_(None))
    return stmt


def paginate(db: Session, stmt: Select, sort: str, desc: bool, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    col = SORTS[sort]
    order = col.desc() if desc else col.asc()
    rows = db.scalars(stmt.order_by(order, Ticket.id.desc()).offset((page - 1) * page_size)
                      .limit(page_size)).unique().all()
    return rows, total
