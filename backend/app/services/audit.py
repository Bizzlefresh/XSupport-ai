from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def record(
    db: Session,
    action: str,
    user_id: int | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    details: dict | None = None,
) -> None:
    """Append an audit entry. Never put secrets or ticket text in `details`."""
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, details=details))
    db.commit()
