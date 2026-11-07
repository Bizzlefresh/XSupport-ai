from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import User
from app.services import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview")
def overview(days: int = Query(30, ge=7, le=365), _: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    return analytics.overview(db, days)


@router.get("/insights")
def insights(weeks: int = Query(12, ge=4, le=52), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics.insights(db, weeks)
