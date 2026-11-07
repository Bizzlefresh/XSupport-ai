"""Chooses the active external provider from settings. With the default settings nothing is created and nothing is called."""
import threading

from app.core.config import Settings, get_settings
from app.integrations.errors import IntegrationDisabled, IntegrationMisconfigured
from app.integrations.models import IntegrationHealth
from app.integrations.teamdynamix import TeamDynamixProvider, validate_config

_lock = threading.Lock()
_provider: TeamDynamixProvider | None = None
_override = None  # tests may install a provider built on a mocked transport


def reset() -> None:
    global _provider, _override
    with _lock:
        _provider = _override = None


def set_override(p) -> None:
    global _override
    _override = p


def _problems(s: Settings) -> list[str]:
    return validate_config(s.teamdynamix_base_url, s.teamdynamix_app_id, s.teamdynamix_token, s.teamdynamix_read_only)


def get_teamdynamix(s: Settings | None = None) -> TeamDynamixProvider:
    global _provider
    s = s or get_settings()
    if not s.teamdynamix_enabled:
        raise IntegrationDisabled("The TeamDynamix integration is disabled")
    if _override is not None:
        return _override
    with _lock:
        if _provider is None:
            problems = _problems(s)
            if problems:
                raise IntegrationMisconfigured("; ".join(problems))
            _provider = TeamDynamixProvider(
                s.teamdynamix_base_url, s.teamdynamix_app_id, s.teamdynamix_token, read_only=s.teamdynamix_read_only,
                timeout=s.teamdynamix_timeout_seconds, max_retries=s.teamdynamix_max_retries,
                backoff_base=s.teamdynamix_backoff_base_seconds, rate_limit_calls=s.teamdynamix_rate_limit_calls,
                rate_limit_period=s.teamdynamix_rate_limit_period_seconds, page_size=s.teamdynamix_page_size,
                include_people=s.teamdynamix_include_people)
        return _provider


def teamdynamix_status(s: Settings | None = None) -> dict:
    """Configuration and health only. Never makes a network request and never returns the token."""
    s = s or get_settings()
    if not s.teamdynamix_enabled:
        health = IntegrationHealth(state="disabled")
    else:
        problems = _problems(s)
        if problems and _override is None:
            health = IntegrationHealth(state="misconfigured", reasons=problems)
        else:
            health = _override.health if _override is not None else (_provider.health if _provider else IntegrationHealth(state="ready"))
    return {
        "enabled": s.teamdynamix_enabled, "read_only": s.teamdynamix_read_only,
        "configured": bool(s.teamdynamix_base_url and s.teamdynamix_token),
        "app_id": s.teamdynamix_app_id or None, "include_people": s.teamdynamix_include_people,
        "state": health.state, "reasons": health.reasons, "requests": health.requests, "failures": health.failures,
        "consecutive_failures": health.consecutive_failures, "last_success_at": health.last_success_at,
        "last_failure_at": health.last_failure_at, "last_error_kind": health.last_error_kind,
        "note": "Disabled by default. Live access requires explicit StFX authorization. Never tested against a real TeamDynamix server.",
    }
