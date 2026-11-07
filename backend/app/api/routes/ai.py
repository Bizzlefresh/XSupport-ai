from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.schemas.ai import ClassifyRequest, PredictionOut, ReviewRequest
from app.schemas.assistant import AssistRequest, FeedbackRequest, SuggestionOut
from app.schemas.retrieval import ArticleHitsOut, RetrievalRequest, SimilarTicketsOut
from app.services import assistant as assistant_svc
from app.services import audit
from app.services import classification as svc
from app.services import retrieval as retrieval_svc

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/classify", response_model=PredictionOut)
def classify(body: ClassifyRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Suggest a category. Never changes the ticket: a technician must accept or edit the suggestion."""
    out = svc.classify(db, user, body.ticket_id, body.subject, body.description)
    if out.stored:  # audit entries carry ids only, never ticket text
        audit.record(db, "ai.classify", user_id=user.id, entity_type="ai_prediction", entity_id=str(out.id),
                     details={"ticket_id": out.ticket_id, "model": out.model_version})
    return out


@router.get("/tickets/{ticket_id}/predictions", response_model=list[PredictionOut])
def ticket_predictions(ticket_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.list_for_ticket(db, ticket_id)


@router.post("/predictions/{prediction_id}/review", response_model=PredictionOut, status_code=status.HTTP_200_OK)
def review_prediction(prediction_id: int, body: ReviewRequest, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    out = svc.review(db, prediction_id, body, user)
    audit.record(db, "ai.review", user_id=user.id, entity_type="ai_prediction", entity_id=str(prediction_id),
                 details={"decision": body.decision})
    return out


@router.post("/similar-incidents", response_model=SimilarTicketsOut)
def similar_incidents(body: RetrievalRequest, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Previous tickets most similar to a ticket or free text. Read-only; retrieved text is displayed, never acted on."""
    return retrieval_svc.similar_tickets(db, body)


@router.post("/related-articles", response_model=ArticleHitsOut)
def related_articles(body: RetrievalRequest, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Approved knowledge articles most relevant to a ticket or free text."""
    return retrieval_svc.related_articles(db, body)


@router.post("/assist", response_model=SuggestionOut)
def assist(body: AssistRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Cited troubleshooting suggestion built only from approved articles and past resolutions. Never changes the ticket."""
    out = assistant_svc.suggest(db, user, body)
    if out.stored:  # ids only, never ticket text
        audit.record(db, "ai.assist", user_id=user.id, entity_type="assistant_suggestion", entity_id=str(out.id),
                     details={"ticket_id": out.ticket_id, "status": out.status})
    return out


@router.get("/tickets/{ticket_id}/assistant", response_model=list[SuggestionOut])
def ticket_suggestions(ticket_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return assistant_svc.list_for_ticket(db, ticket_id)


@router.post("/assistant/{suggestion_id}/feedback", response_model=SuggestionOut)
def rate_suggestion(suggestion_id: int, body: FeedbackRequest, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    out = assistant_svc.rate(db, suggestion_id, body, user)
    audit.record(db, "ai.assist_feedback", user_id=user.id, entity_type="assistant_suggestion", entity_id=str(suggestion_id),
                 details={"rating": body.rating})
    return out
