from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models.user import User

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/status")
def integration_status(_: User = Depends(get_current_user)) -> dict:
    """Reports configuration state only. Makes no outbound requests and never returns secrets."""
    s = get_settings()
    return {
        "synthetic_data": {"enabled": True, "default": True},
        "teamdynamix": {
            "enabled": s.teamdynamix_enabled,
            "read_only": s.teamdynamix_read_only,
            "configured": bool(s.teamdynamix_base_url and s.teamdynamix_token),
            "note": "Disabled by default. Live access requires explicit StFX authorization.",
        },
        "external_llm": {"enabled": s.external_llm_enabled},
    }
