from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.config import get_settings
from app.db.session import get_db
from app.integrations import registry
from app.integrations.errors import (
    IntegrationAuthError,
    IntegrationDisabled,
    IntegrationError,
    IntegrationMisconfigured,
    IntegrationUnavailable,
)
from app.models.user import Role, User
from app.services import audit, tdx_import

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _http(exc: IntegrationError) -> HTTPException:
    """Controlled failure: a clear status and a message that never contains tokens, URLs or ticket text."""
    code = {IntegrationDisabled: status.HTTP_409_CONFLICT, IntegrationMisconfigured: status.HTTP_409_CONFLICT,
            IntegrationAuthError: status.HTTP_502_BAD_GATEWAY, IntegrationUnavailable: status.HTTP_503_SERVICE_UNAVAILABLE}.get(
        type(exc), status.HTTP_502_BAD_GATEWAY)
    return HTTPException(code, str(exc))


@router.get("/status")
def integration_status(_: User = Depends(get_current_user)) -> dict:
    """Reports configuration and health only. Makes no outbound requests and never returns secrets."""
    s = get_settings()
    return {
        "synthetic_data": {"enabled": True, "default": True},
        "teamdynamix": registry.teamdynamix_status(s),
        "external_llm": {"enabled": s.external_llm_enabled},
    }


@router.post("/teamdynamix/test")
def test_teamdynamix(user: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)) -> dict:
    """Admin only. Makes ONE read request (list ticket statuses) to check the connection. Fails cleanly if disabled."""
    try:
        names = registry.get_teamdynamix().list_statuses()
    except IntegrationError as exc:
        audit.record(db, "integration.tdx_test", user_id=user.id, details={"ok": False, "kind": exc.kind})
        raise _http(exc) from exc
    audit.record(db, "integration.tdx_test", user_id=user.id, details={"ok": True, "statuses": len(names)})
    return {"ok": True, "statuses_found": len(names)}


@router.post("/teamdynamix/import")
def import_teamdynamix(dry_run: bool = Query(True), limit: int = Query(25, ge=1, le=1000),
                       user: User = Depends(require_roles(Role.admin)), db: Session = Depends(get_db)) -> dict:
    """Admin only. Dry run by default: shows what would be copied. Writes only to XSupport, never to TeamDynamix."""
    s = get_settings()
    limit = min(limit, s.teamdynamix_import_max)
    try:
        result = tdx_import.import_tickets(db, registry.get_teamdynamix(s), user, limit=limit, dry_run=dry_run)
    except IntegrationError as exc:
        audit.record(db, "integration.tdx_import", user_id=user.id, details={"ok": False, "kind": exc.kind, "dry_run": dry_run})
        raise _http(exc) from exc
    audit.record(db, "integration.tdx_import", user_id=user.id,
                 details={"ok": True, "dry_run": dry_run, "fetched": result["fetched"], "created": result.get("created", 0)})
    return result
