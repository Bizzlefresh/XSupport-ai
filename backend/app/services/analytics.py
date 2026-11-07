import statistics
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Category, Ticket, TicketActivity, TicketStatus
from app.services import assistant as assistant_svc
from app.services import classification as classification_svc
from app.services.incidents import MIN_TICKETS, WINDOW_HOURS, detect_bursts

DONE = [TicketStatus.resolved, TicketStatus.closed]


def _counts(db: Session, col) -> dict[str, int]:
    return {(k.value if hasattr(k, "value") else str(k)): n
            for k, n in db.execute(select(col, func.count()).group_by(col)).all()}


def overview(db: Session, days: int = 30) -> dict:
    """Every figure is computed from persisted tickets; nothing is hardcoded."""
    by_status = _counts(db, Ticket.status)
    by_priority = _counts(db, Ticket.priority)
    high_open = db.scalar(select(func.count()).where(
        Ticket.priority.in_(["critical", "high"]), Ticket.status.notin_(DONE))) or 0

    cat_rows = db.execute(
        select(Category.name, func.count(Ticket.id)).select_from(Ticket)
        .outerjoin(Category, Ticket.category_id == Category.id)
        .group_by(Category.name).order_by(func.count(Ticket.id).desc())).all()

    # Resolution time: only resolved/closed tickets with a resolved_at that is not before created_at.
    pairs = db.execute(select(Ticket.created_at, Ticket.resolved_at)
                       .where(Ticket.status.in_(DONE), Ticket.resolved_at.is_not(None))).all()
    hours = []
    for c, r in pairs:
        secs = (r.replace(tzinfo=None) - c.replace(tzinfo=None)).total_seconds()
        if secs >= 0:
            hours.append(secs / 3600)

    end = datetime.now(UTC).date()
    start = end - timedelta(days=days - 1)
    since = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
    created = {str(d): n for d, n in db.execute(
        select(func.date(Ticket.created_at), func.count()).where(Ticket.created_at >= since)
        .group_by(func.date(Ticket.created_at))).all()}
    resolved = {str(d): n for d, n in db.execute(
        select(func.date(Ticket.resolved_at), func.count())
        .where(Ticket.resolved_at.is_not(None), Ticket.resolved_at >= since)
        .group_by(func.date(Ticket.resolved_at))).all()}
    trend = [{"date": str(start + timedelta(days=i)),
              "created": created.get(str(start + timedelta(days=i)), 0),
              "resolved": resolved.get(str(start + timedelta(days=i)), 0)} for i in range(days)]

    recent = db.execute(
        select(TicketActivity, Ticket.subject).join(Ticket, Ticket.id == TicketActivity.ticket_id)
        .order_by(TicketActivity.created_at.desc(), TicketActivity.id.desc()).limit(10)).unique().all()

    return {
        "totals": {
            "total": sum(by_status.values()),
            "open": by_status.get("new", 0) + by_status.get("open", 0),
            "pending": by_status.get("pending", 0),
            "resolved": by_status.get("resolved", 0) + by_status.get("closed", 0),
            "high_priority_open": high_open,
        },
        "by_status": by_status,
        "by_priority": by_priority,
        "by_category": [{"name": n or "Uncategorized", "count": c} for n, c in cat_rows],
        "trend": trend,
        "resolution": {"average_hours": round(sum(hours) / len(hours), 1) if hours else None,
                       "tickets_counted": len(hours)},
        "recent_activity": [
            {"ticket_id": a.ticket_id, "ticket_number": f"XS-{a.ticket_id:05d}", "subject": s, "kind": a.kind,
             "detail": a.detail[:140], "created_at": a.created_at, "user": a.user.full_name if a.user else None}
            for a, s in recent],
    }


AGE_BUCKETS = [("under 1 day", 0, 1), ("1 to 3 days", 1, 3), ("3 to 7 days", 3, 7), ("7 to 14 days", 7, 14), ("over 14 days", 14, 10**6)]


def _naive(d: datetime) -> datetime:
    return d.replace(tzinfo=None) if d.tzinfo else d


def _summ(vals: list[float]) -> dict:
    return {"n": len(vals), "median_hours": round(statistics.median(vals), 1) if vals else None,
            "mean_hours": round(sum(vals) / len(vals), 1) if vals else None}


def insights(db: Session, weeks: int = 12, now: datetime | None = None) -> dict:
    """Deeper analytics, all computed from stored tickets. Aggregation is done in Python, which is fine for thousands of
    tickets; at much larger scale it should move into SQL."""
    now = _naive(now or datetime.now(UTC))
    rows = db.execute(
        select(Ticket.id, Ticket.subject, Ticket.status, Ticket.priority, Ticket.created_at, Ticket.resolved_at, Category.name)
        .outerjoin(Category, Ticket.category_id == Category.id)).all()
    done = {"resolved", "closed"}
    st = lambda r: r.status.value if hasattr(r.status, "value") else str(r.status)  # noqa: E731
    pr = lambda r: r.priority.value if hasattr(r.priority, "value") else str(r.priority)  # noqa: E731

    # weekly volume by category (ISO weeks, Monday start) for the last N weeks
    this_monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    starts = [this_monday - timedelta(weeks=weeks - 1 - i) for i in range(weeks)]
    cats = sorted({r.name or "Uncategorized" for r in rows})
    vol = [{"week": w.date().isoformat(), **{c: 0 for c in cats}} for w in starts]
    for r in rows:
        k = int((_naive(r.created_at) - starts[0]).total_seconds() // (7 * 86400))
        if 0 <= k < weeks:
            vol[k][r.name or "Uncategorized"] += 1

    # resolution time, valid timestamps only
    by_cat: dict[str, list[float]] = {}
    by_pri: dict[str, list[float]] = {}
    missing_ts = negative = 0
    for r in rows:
        if st(r) not in done:
            continue
        if r.resolved_at is None:
            missing_ts += 1
            continue
        h = (_naive(r.resolved_at) - _naive(r.created_at)).total_seconds() / 3600
        if h < 0:
            negative += 1
            continue
        by_cat.setdefault(r.name or "Uncategorized", []).append(h)
        by_pri.setdefault(pr(r), []).append(h)

    # backlog aging for unresolved tickets
    aging = [{"bucket": name, "count": 0} for name, _, _ in AGE_BUCKETS]
    for r in rows:
        if st(r) in done:
            continue
        age = (now - _naive(r.created_at)).total_seconds() / 86400
        for i, (_, lo, hi) in enumerate(AGE_BUCKETS):
            if lo <= max(age, 0) < hi:
                aging[i]["count"] += 1
                break

    # recurring issues: identical subject lines (case/space-insensitive)
    groups: dict[str, dict] = {}
    for r in rows:
        key = " ".join(r.subject.lower().split())
        g = groups.setdefault(key, {"subject": r.subject, "count": 0, "open": 0, "categories": set(), "hours": []})
        g["count"] += 1
        g["open"] += st(r) not in done
        g["categories"].add(r.name or "Uncategorized")
        if st(r) in done and r.resolved_at is not None:
            h = (_naive(r.resolved_at) - _naive(r.created_at)).total_seconds() / 3600
            if h >= 0:
                g["hours"].append(h)
    recurring = sorted(({"subject": g["subject"], "count": g["count"], "open": g["open"], "category": sorted(g["categories"])[0],
                         "median_hours": round(statistics.median(g["hours"]), 1) if g["hours"] else None}
                        for g in groups.values() if g["count"] >= 3), key=lambda x: (-x["count"], x["subject"]))[:10]

    bursts = detect_bursts([(r.id, r.name or "Uncategorized", _naive(r.created_at)) for r in rows])
    open_ids = {r.id for r in rows if st(r) not in done}
    incidents = [{"category": b.category, "start": b.start.isoformat(), "end": b.end.isoformat(), "tickets": len(b.ticket_ids),
                  "still_open": sum(t in open_ids for t in b.ticket_ids), "ticket_ids": b.ticket_ids[:20]} for b in bursts]

    return {
        "weeks": weeks, "volume_by_week": vol, "categories": cats,
        "resolution_by_category": sorted(({"name": k, **_summ(v)} for k, v in by_cat.items()), key=lambda x: -x["n"]),
        "resolution_by_priority": [{"name": p, **_summ(by_pri.get(p, []))} for p in ("critical", "high", "medium", "low")],
        "backlog_aging": aging, "recurring_issues": recurring,
        "incident_bursts": {"rule": f"{MIN_TICKETS} or more tickets in one category within {WINDOW_HOURS} hours", "found": incidents},
        "data_quality": {"resolved_without_timestamp": missing_ts, "resolved_before_created": negative,
                         "note": "These tickets are left out of resolution-time figures."},
        "ai_use": {"category_review": classification_svc.review_stats(db), "assistant": assistant_svc.stats(db)},
    }
