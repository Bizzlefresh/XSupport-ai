from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.classification import service as clf
from app.models import AIPrediction, Category, ReviewDecision, TechnicianFeedback, Ticket, User
from app.schemas.ai import Candidate, PredictionOut, ReviewOut, ReviewRequest
from app.schemas.ticket import TicketUpdate
from app.services import tickets as ticket_svc


def _category_ids(db: Session) -> dict[str, int]:
    return {c.name: c.id for c in db.scalars(select(Category).where(Category.is_active))}


def _classifier() -> clf.CategoryClassifier:
    try:
        return clf.get_classifier()
    except clf.ClassifierUnavailable as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(e)) from None


def to_out(p: AIPrediction, ids: dict[str, int]) -> PredictionOut:
    review = None
    if p.feedback is not None:
        review = ReviewOut.model_validate(p.feedback)
    return PredictionOut(
        id=p.id, ticket_id=p.ticket_id, kind=p.kind, model_name=p.model_name, model_version=p.model_version,
        predicted=Candidate(label=p.predicted_label, category_id=p.predicted_category_id, probability=p.confidence),
        confidence=p.confidence,
        alternatives=[Candidate(label=a["label"], category_id=ids.get(a["label"]), probability=a["probability"])
                      for a in p.alternatives],
        needs_manual_review=p.needs_manual_review, threshold=p.threshold, latency_ms=p.latency_ms,
        created_at=p.created_at, review=review, stored=True)


def classify(db: Session, user: User, ticket_id: int | None, subject: str | None, description: str | None) -> PredictionOut:
    model = _classifier()
    ids = _category_ids(db)
    if ticket_id is None:
        r = model.predict(subject or "", description or "")
        return PredictionOut(
            id=None, ticket_id=None, kind="category", model_name=r.model_name, model_version=r.model_version,
            predicted=Candidate(label=r.label, category_id=ids.get(r.label), probability=r.confidence),
            confidence=r.confidence,
            alternatives=[Candidate(label=a["label"], category_id=ids.get(a["label"]), probability=a["probability"])
                          for a in r.alternatives],
            needs_manual_review=r.needs_manual_review, threshold=r.threshold, latency_ms=r.latency_ms,
            created_at=None, stored=False)
    ticket = ticket_svc.get_ticket(db, ticket_id)
    r = model.predict(ticket.subject, ticket.description)
    p = AIPrediction(
        ticket_id=ticket.id, kind="category", model_name=r.model_name, model_version=r.model_version,
        predicted_label=r.label, predicted_category_id=ids.get(r.label), confidence=r.confidence,
        alternatives=r.alternatives, needs_manual_review=r.needs_manual_review, threshold=r.threshold,
        latency_ms=r.latency_ms, created_by=user.id)
    db.add(p)
    ticket_svc.log_activity(db, ticket, user, "ai", f"AI category suggestion requested ({r.model_name} {r.model_version})")
    db.commit()
    db.refresh(p)
    return to_out(p, ids)


def list_for_ticket(db: Session, ticket_id: int) -> list[PredictionOut]:
    ticket_svc.get_ticket(db, ticket_id)
    ids = _category_ids(db)
    rows = db.scalars(select(AIPrediction).where(AIPrediction.ticket_id == ticket_id)
                      .order_by(AIPrediction.created_at.desc(), AIPrediction.id.desc())).unique().all()
    return [to_out(p, ids) for p in rows]


def review(db: Session, prediction_id: int, body: ReviewRequest, user: User) -> PredictionOut:
    p = db.get(AIPrediction, prediction_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prediction not found")
    if p.feedback is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This suggestion has already been reviewed")
    decision = ReviewDecision(body.decision)
    final_id = None
    # Validate everything BEFORE queuing any rows, so a rejected request leaves nothing half-written.
    if decision == ReviewDecision.accepted:
        cat = db.get(Category, p.predicted_category_id) if p.predicted_category_id else None
        if cat is None or not cat.is_active:
            raise HTTPException(422, "The suggested category is no longer active; edit the suggestion and choose a category")
        final_id = cat.id
    elif decision == ReviewDecision.edited:
        final_id = body.final_category_id
        if final_id == p.predicted_category_id:
            raise HTTPException(422, "The chosen category equals the suggestion; use accept instead")
        cat = db.get(Category, final_id)
        if cat is None or not cat.is_active:
            raise HTTPException(422, "Unknown or inactive category")

    ticket = ticket_svc.get_ticket(db, p.ticket_id)
    db.add(TechnicianFeedback(prediction_id=p.id, decision=decision, final_category_id=final_id,
                              reason=(body.reason or "").strip() or None, user_id=user.id,
                              created_at=datetime.now(UTC)))
    ticket_svc.log_activity(db, ticket, user, "ai", f"AI category suggestion '{p.predicted_label}' {decision.value}")
    if final_id is not None:
        # Commits the feedback row together with the (logged) category change.
        ticket_svc.update_ticket(db, p.ticket_id, TicketUpdate(category_id=final_id), user)
    else:
        db.commit()
    db.refresh(p)
    return to_out(p, _category_ids(db))


def review_stats(db: Session) -> dict:
    """Human-review figures computed from stored feedback. Only reviewed suggestions are counted."""
    preds = db.scalar(select(func.count()).select_from(AIPrediction).where(AIPrediction.kind == "category")) or 0
    flagged = db.scalar(select(func.count()).select_from(AIPrediction).where(
        AIPrediction.kind == "category", AIPrediction.needs_manual_review.is_(True))) or 0
    lat = db.scalar(select(func.avg(AIPrediction.latency_ms)).where(AIPrediction.kind == "category"))
    counts = {d.value: n for d, n in db.execute(
        select(TechnicianFeedback.decision, func.count()).group_by(TechnicianFeedback.decision)).all()}
    reviewed = sum(counts.values())

    def rate(n: int) -> float | None:
        return round(n / reviewed, 4) if reviewed else None

    return {
        "predictions": preds, "flagged_for_manual_review": flagged, "reviewed": reviewed,
        "pending_review": preds - reviewed,
        "accepted": counts.get("accepted", 0), "edited": counts.get("edited", 0), "rejected": counts.get("rejected", 0),
        "acceptance_rate": rate(counts.get("accepted", 0)), "correction_rate": rate(counts.get("edited", 0)),
        "rejection_rate": rate(counts.get("rejected", 0)),
        "mean_latency_ms": round(float(lat), 2) if lat is not None else None,
    }


__all__ = ["Ticket", "classify", "list_for_ticket", "review", "review_stats"]
