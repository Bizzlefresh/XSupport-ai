"""Copies tickets from an external provider into XSupport (read-only toward the provider).

Defaults to a dry run. Existing local tickets are never overwritten: a ticket already imported is skipped, so local edits and
AI review history stay intact. Imported text is processed only by XSupport's local models; nothing is sent to an external AI service.
"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.base import TicketProvider
from app.models import Category, Priority, Ticket, TicketStatus, User
from app.services import tickets as ticket_svc

SOURCE = "teamdynamix"


def import_tickets(db: Session, provider: TicketProvider, user: User, *, limit: int, dry_run: bool = True) -> dict:
    fetched = list(provider.iter_tickets(max_items=limit))  # fetch everything first, so a provider failure writes nothing
    skipped_provider = getattr(provider, "last_skipped", 0)
    cats = {c.name.lower(): c.id for c in db.scalars(select(Category))}
    existing = set(db.scalars(select(Ticket.external_id).where(Ticket.source == SOURCE)))

    new, dupes, unmapped = [], 0, 0
    for t in fetched:
        ext = f"TDX-{t.external_id}"
        if ext in existing:
            dupes += 1
            continue
        cid = cats.get((t.category_name or "").lower())
        unmapped += cid is None
        new.append((ext, t, cid))

    preview = [{"external_id": e, "status": t.status, "priority": t.priority, "category": t.category_name,
                "mapped_category": cid is not None}
               for e, t, cid in new[:5]]
    result = {"dry_run": dry_run, "fetched": len(fetched), "would_create" if dry_run else "created": len(new),
              "already_imported": dupes, "category_not_matched": unmapped, "skipped_incomplete_records": skipped_provider,
              "preview": preview}
    if dry_run or not new:
        return result

    now = datetime.now(UTC)
    for ext, t, cid in new:
        done = t.status in ("resolved", "closed")
        row = Ticket(source=SOURCE, external_id=ext, subject=t.title, description=t.description, category_id=cid,
                     priority=Priority(t.priority), status=TicketStatus(t.status), created_at=t.created_at or now,
                     updated_at=t.modified_at or t.created_at or now,
                     resolved_at=(t.completed_at or t.modified_at) if done else None)
        db.add(row)
        db.flush()
        ticket_svc.log_activity(db, row, user, "created", "Imported from TeamDynamix as a read-only copy")
    db.commit()
    return result
