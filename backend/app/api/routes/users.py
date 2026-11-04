from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    _: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)
) -> list[User]:
    """Administrator-only. Also exercises the role-check dependency end to end."""
    return list(db.scalars(select(User).order_by(User.id)))
