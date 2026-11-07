from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.troubleshooting import assistant as core
from app.models import ArticleStatus, AssistantSuggestion, KnowledgeArticle, Ticket, User
from app.schemas.assistant import AssistRequest, FeedbackRequest, SuggestionOut
from app.schemas.retrieval import RetrievalMeta, RetrievalRequest
from app.services import retrieval as retrieval_svc
from app.services import tickets as ticket_svc

RESOLVED = {"resolved", "closed"}


def _to_out(row: AssistantSuggestion | None, payload: dict, meta: RetrievalMeta, ticket_id: int | None) -> SuggestionOut:
    return SuggestionOut(
        id=row.id if row else None, ticket_id=ticket_id, status=payload["status"], articles=payload["articles"],
        past_resolutions=payload["past_resolutions"], questions=payload["questions"], notes=payload["notes"],
        assistant_version=core.ASSISTANT_VERSION, meta=meta, created_at=row.created_at if row else None,
        rating=row.rating if row else None, rating_comment=row.rating_comment if row else None, stored=row is not None)


def _meta(payload: dict, row: AssistantSuggestion) -> RetrievalMeta:
    return RetrievalMeta(method="hybrid", embedder=row.embedder, threshold=row.threshold, note=None, latency_ms=row.latency_ms)


def suggest(db: Session, user: User, req: AssistRequest) -> SuggestionOut:
    rr = RetrievalRequest(ticket_id=req.ticket_id, subject=req.subject, description=req.description, method="hybrid", limit=5)
    arts = retrieval_svc.related_articles(db, rr)  # 404s on an unknown ticket
    sims = retrieval_svc.similar_tickets(db, rr)
    threshold = arts.meta.threshold

    ids = [a.article_id for a in arts.results]
    rows = {a.id: a for a in db.scalars(select(KnowledgeArticle).where(
        KnowledgeArticle.id.in_(ids), KnowledgeArticle.status == ArticleStatus.approved)).unique()} if ids else {}
    candidates = [core.ArticleEvidence(h.article_id, rows[h.article_id].title, h.score, h.confidence, h.category,
                                       list(rows[h.article_id].steps), rows[h.article_id].escalation, h.source_type)
                  for h in arts.results if h.article_id in rows]
    past = [core.PastResolution(t.ticket_id, t.external_id, t.title, t.score, t.resolution_summary)
            for t in sims.results if t.status in RESOLVED and t.resolution_summary]
    s = core.decide(candidates, past, threshold)
    payload = {"status": s.status, "questions": s.questions, "notes": s.notes,
               "articles": [a.__dict__ for a in s.articles], "past_resolutions": [p.__dict__ for p in s.past_resolutions]}
    meta = RetrievalMeta(method="hybrid", embedder=arts.meta.embedder, threshold=threshold, note=arts.meta.note,
                         latency_ms=round(arts.meta.latency_ms + sims.meta.latency_ms, 2))
    if req.ticket_id is None:
        return _to_out(None, payload, meta, None)

    ticket = ticket_svc.get_ticket(db, req.ticket_id)
    row = AssistantSuggestion(ticket_id=ticket.id, status=s.status, payload=payload, assistant_version=core.ASSISTANT_VERSION,
                              embedder=meta.embedder, threshold=threshold, latency_ms=meta.latency_ms, created_by=user.id)
    db.add(row)
    ticket_svc.log_activity(db, ticket, user, "ai", f"Troubleshooting suggestion requested ({core.ASSISTANT_VERSION}, {s.status})")
    db.commit()
    return _to_out(row, payload, meta, ticket.id)


def list_for_ticket(db: Session, ticket_id: int) -> list[SuggestionOut]:
    ticket_svc.get_ticket(db, ticket_id)
    rows = db.scalars(select(AssistantSuggestion).where(AssistantSuggestion.ticket_id == ticket_id)
                      .order_by(AssistantSuggestion.created_at.desc(), AssistantSuggestion.id.desc())).unique().all()
    return [_to_out(r, r.payload, _meta(r.payload, r), ticket_id) for r in rows]


def rate(db: Session, suggestion_id: int, body: FeedbackRequest, user: User) -> SuggestionOut:
    row = db.get(AssistantSuggestion, suggestion_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Suggestion not found")
    if row.rating is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This suggestion has already been rated")
    row.rating, row.rating_comment, row.rated_by, row.rated_at = body.rating, body.comment, user.id, datetime.now(UTC)
    ticket = db.get(Ticket, row.ticket_id)
    ticket_svc.log_activity(db, ticket, user, "ai", f"Troubleshooting suggestion rated: {body.rating}")
    db.commit()
    return _to_out(row, row.payload, _meta(row.payload, row), row.ticket_id)


def stats(db: Session) -> dict:
    total = db.scalar(select(func.count()).select_from(AssistantSuggestion)) or 0
    by_status = dict(db.execute(select(AssistantSuggestion.status, func.count()).group_by(AssistantSuggestion.status)).all())
    by_rating = dict(db.execute(select(AssistantSuggestion.rating, func.count())
                                .where(AssistantSuggestion.rating.is_not(None)).group_by(AssistantSuggestion.rating)).all())
    rated = sum(by_rating.values())
    return {"suggestions": total, "by_status": by_status, "rated": rated, "by_rating": by_rating,
            "helpful_rate": round(by_rating.get("helpful", 0) / rated, 3) if rated else None}
