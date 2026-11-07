import json
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import assistant as assistant_svc
from app.services import classification

router = APIRouter(prefix="/evaluation", tags=["evaluation"])
RETRIEVAL_REPORT = Path(__file__).resolve().parents[4] / "data" / "evaluation" / "retrieval_report.json"
INCIDENT_REPORT = Path(__file__).resolve().parents[4] / "data" / "evaluation" / "incident_report.json"
ASSISTANT_REPORT = Path(__file__).resolve().parents[4] / "data" / "evaluation" / "assistant_report.json"
REPORT = Path(__file__).resolve().parents[4] / "data" / "evaluation" / "classification_report.json"


@router.get("/summary")
def summary(_: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    """Offline benchmark (from the reproducible training report) plus live technician-review statistics."""
    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else None
    retrieval = json.loads(RETRIEVAL_REPORT.read_text(encoding="utf-8")) if RETRIEVAL_REPORT.exists() else None
    assistant = json.loads(ASSISTANT_REPORT.read_text(encoding="utf-8")) if ASSISTANT_REPORT.exists() else None
    incidents = json.loads(INCIDENT_REPORT.read_text(encoding="utf-8")) if INCIDENT_REPORT.exists() else None
    return {"classification_report": report, "retrieval_report": retrieval, "assistant_report": assistant, "incident_report": incidents,
            "review_stats": classification.review_stats(db), "assistant_stats": assistant_svc.stats(db)}
