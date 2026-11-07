"""TeamDynamix adapter (read-only).

IMPORTANT, read before enabling:
- It is disabled by default and must not be pointed at a real TeamDynamix instance without written authorisation.
- It is tested only against mocked HTTP responses. No request has ever been sent to a real TeamDynamix server.
- The endpoint paths come from the project brief. Field names in `map_*` and the paged-search request/response shape are
  written from general knowledge of the TeamDynamix Web API and have NOT been checked against the StFX OpenAPI
  specification. Compare them with the published specification and adjust before any approved use.
- Only read operations are allowed: the client refuses any other method/path (see ALLOWED). Write support is deliberately
  not implemented.
"""
import logging
import random
import re
import threading
import time
from collections.abc import Iterator
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx

from app.integrations.errors import (
    IntegrationAuthError,
    IntegrationError,
    IntegrationMisconfigured,
    IntegrationUnavailable,
    ReadOnlyViolation,
)
from app.integrations.models import ExternalArticle, ExternalComment, ExternalTicket, IntegrationHealth
from app.integrations.rate_limit import SlidingWindowLimiter
from app.schemas.knowledge import plain

log = logging.getLogger("xsupport.tdx")
for _noisy in ("httpx", "httpcore"):  # their INFO lines contain full URLs (ticket ids); keep our own masked log line instead
    logging.getLogger(_noisy).setLevel(logging.WARNING)
RETRY_STATUS = {429, 502, 503, 504}
MAX_PAGES = 200  # hard stop against a server that never returns a short page
CIRCUIT_AFTER = 5
CIRCUIT_COOLDOWN = 60.0
MAX_RETRY_AFTER = 60.0
_TAGS = re.compile(r"<[^>]*>")
_SPACES = re.compile(r"[ \t]{2,}")


def _allowed(app_id: str) -> list[tuple[str, re.Pattern]]:
    a = re.escape(app_id)
    return [("GET", re.compile(rf"^/api/{a}/tickets/\d+$")), ("POST", re.compile(rf"^/api/{a}/tickets/search(/paged)?$")),
            ("GET", re.compile(rf"^/api/{a}/tickets/\d+/feed$")), ("GET", re.compile(rf"^/api/{a}/tickets/statuses$")),
            ("POST", re.compile(rf"^/api/{a}/knowledgebase/search$")), ("GET", re.compile(rf"^/api/{a}/knowledgebase/\d+$"))]


def validate_config(base_url: str, app_id: str, token: str, read_only: bool) -> list[str]:
    """Returns human-readable problems (never the token). Empty list means usable."""
    problems = []
    u = urlparse(base_url or "")
    if not base_url:
        problems.append("TEAMDYNAMIX_BASE_URL is not set")
    elif u.scheme != "https" or not u.hostname or u.username or u.password or u.query or u.fragment:
        problems.append("TEAMDYNAMIX_BASE_URL must be a plain https URL without credentials or query")
    if not (app_id or "").isdigit():
        problems.append("TEAMDYNAMIX_APP_ID must be a number")
    if not token:
        problems.append("TEAMDYNAMIX_TOKEN is not set")
    if not read_only:
        problems.append("Write access is not implemented; TEAMDYNAMIX_READ_ONLY must stay true")
    return problems


# ---------- field mapping ----------
def _dt(v) -> datetime | None:
    if not v or not isinstance(v, str):
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=UTC)  # a time with no zone is treated as UTC


def _text(v, limit: int) -> str:
    return _SPACES.sub(" ", plain(_TAGS.sub(" ", str(v)))).strip()[:limit] if v else ""


def map_status(name: str | None) -> str:
    n = (name or "").lower()
    if any(k in n for k in ("closed", "cancel")):
        return "closed"
    if any(k in n for k in ("resolved", "complete", "done")):
        return "resolved"
    if any(k in n for k in ("hold", "pending", "waiting")):
        return "pending"
    if "new" in n or "submitted" in n:
        return "new"
    return "open"


def map_priority(name: str | None) -> str:
    n = (name or "").lower()
    if any(k in n for k in ("urgent", "critical", "emergency")):
        return "critical"
    if "high" in n:
        return "high"
    if "low" in n:
        return "low"
    return "medium"


def map_ticket(raw: dict, include_people: bool = False) -> ExternalTicket | None:
    """Returns None when the record lacks an id or a title (it is counted as skipped, not guessed)."""
    tid, title = raw.get("ID"), _text(raw.get("Title"), 300)
    if tid is None or not title:
        return None
    return ExternalTicket(
        provider="teamdynamix", external_id=str(tid), title=title, description=_text(raw.get("Description"), 10000) or title,
        status=map_status(raw.get("StatusName")), priority=map_priority(raw.get("PriorityName")),
        category_name=_text(raw.get("ServiceName") or raw.get("TypeName"), 100) or None,
        created_at=_dt(raw.get("CreatedDate")), modified_at=_dt(raw.get("ModifiedDate")), completed_at=_dt(raw.get("CompletedDate")),
        requestor=_text(raw.get("RequestorName"), 100) or None if include_people else None,
        assignee=_text(raw.get("ResponsibleFullName"), 100) or None if include_people else None)


def map_feed_item(raw: dict, include_people: bool = False) -> ExternalComment | None:
    if raw.get("IsPrivate"):
        return None  # private entries are never read into XSupport
    body = _text(raw.get("Body"), 5000)
    if not body:
        return None
    author = (_text(raw.get("CreatedFullName"), 100) or None) if include_people else None
    return ExternalComment(_dt(raw.get("CreatedDate")), body, author)


def map_article(raw: dict) -> ExternalArticle | None:
    aid, title = raw.get("ID"), _text(raw.get("Subject"), 200)
    if aid is None or not title:
        return None
    return ExternalArticle("teamdynamix", str(aid), title, _text(raw.get("Body"), 20000), _text(raw.get("CategoryName"), 100) or None,
                           _text(raw.get("Status"), 50) or None, _dt(raw.get("ModifiedDate")))


def _items(payload) -> list[dict]:
    """Paged responses are accepted as a bare list or an object holding the list (shape unverified)."""
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("Items", "Results", "Data", "items"):
            if isinstance(payload.get(key), list):
                return [x for x in payload[key] if isinstance(x, dict)]
    return []


class TeamDynamixProvider:
    name = "teamdynamix"

    def __init__(self, base_url: str, app_id: str, token: str, *, read_only: bool = True, timeout: float = 15.0, max_retries: int = 3,
                 backoff_base: float = 0.5, rate_limit_calls: int = 60, rate_limit_period: float = 60.0, page_size: int = 50,
                 include_people: bool = False, transport: httpx.BaseTransport | None = None, sleep=time.sleep, clock=time.monotonic):
        problems = validate_config(base_url, app_id, token, read_only)
        if problems:
            raise IntegrationMisconfigured("; ".join(problems))
        self._base, self._app = base_url.rstrip("/"), app_id
        self._allowed = _allowed(app_id)
        self.max_retries, self.backoff_base = max_retries, backoff_base
        self.page_size, self.include_people = max(1, page_size), include_people
        self._sleep, self._clock = sleep, clock
        self._limiter = SlidingWindowLimiter(rate_limit_calls, rate_limit_period, clock=clock, sleep=sleep)
        # Redirects are never followed, so the token cannot be sent to another host.
        self._http = httpx.Client(base_url=self._base, timeout=timeout, follow_redirects=False, transport=transport,
                                  headers={"Authorization": f"Bearer {token}", "Accept": "application/json"})
        self.health = IntegrationHealth(state="ready")
        self._lock = threading.Lock()
        self._open_until = 0.0

    def __repr__(self) -> str:  # never includes the token
        return f"TeamDynamixProvider(base={self._base!r}, app_id={self._app!r}, state={self.health.state})"

    # ---- health / circuit breaker
    def _record(self, ok: bool, kind: str | None = None) -> None:
        with self._lock:
            h, now = self.health, datetime.now(UTC)
            h.requests += 1
            if ok:
                h.consecutive_failures, h.last_success_at, h.state = 0, now, "ready"
                return
            h.failures += 1
            h.consecutive_failures += 1
            h.last_failure_at, h.last_error_kind = now, kind
            if h.consecutive_failures >= CIRCUIT_AFTER:
                self._open_until = self._clock() + CIRCUIT_COOLDOWN
                h.state = "paused"
            else:
                h.state = "degraded"

    def _check_circuit(self) -> None:
        with self._lock:
            if self.health.state == "paused":
                if self._clock() < self._open_until:
                    raise IntegrationUnavailable("TeamDynamix requests are paused after repeated failures; try again shortly")
                self.health.state = "degraded"  # cooldown over: allow one trial request

    # ---- request core
    def _request(self, method: str, path: str, json: dict | None = None):
        if not any(m == method and p.match(path) for m, p in self._allowed):
            raise ReadOnlyViolation(f"{method} {path.rsplit('/', 1)[0]} is not an allowed read operation")
        self._check_circuit()
        last_kind = "unavailable"
        for attempt in range(self.max_retries + 1):
            self._limiter.acquire()
            t0 = self._clock()
            try:
                r = self._http.request(method, path, json=json)
            except httpx.TimeoutException:
                last_kind = "timeout"
            except httpx.TransportError:
                last_kind = "network"
            else:
                log.info("tdx %s %s -> %s (%.0f ms)", method, re.sub(r"\d+", "{n}", path), r.status_code, (self._clock() - t0) * 1000)
                if r.status_code in (401, 403):
                    self._record(False, "auth")
                    raise IntegrationAuthError(
                        "TeamDynamix rejected the token: it may have expired (tokens last 24 hours) or the account lacks permission")
                if r.status_code == 404:
                    self._record(True)
                    return None
                if r.status_code in RETRY_STATUS:
                    last_kind = f"http_{r.status_code}"
                    if attempt < self.max_retries:
                        self._sleep(self._delay(attempt, r.headers.get("Retry-After")))
                        continue
                elif 200 <= r.status_code < 300:
                    try:
                        data = r.json()
                    except ValueError:
                        self._record(False, "bad_response")
                        raise IntegrationUnavailable("TeamDynamix returned a response that is not valid JSON") from None
                    self._record(True)
                    return data
                else:
                    self._record(False, f"http_{r.status_code}")
                    raise IntegrationError(f"TeamDynamix returned HTTP {r.status_code}")
            if attempt < self.max_retries and last_kind in ("timeout", "network"):
                self._sleep(self._delay(attempt, None))
        self._record(False, last_kind)
        raise IntegrationUnavailable(f"TeamDynamix is unavailable ({last_kind}) after {self.max_retries + 1} attempts")

    def _delay(self, attempt: int, retry_after: str | None) -> float:
        if retry_after:
            try:
                return min(max(float(retry_after), 0.0), MAX_RETRY_AFTER)
            except ValueError:
                pass
        return min(self.backoff_base * (2 ** attempt) + random.uniform(0, self.backoff_base), MAX_RETRY_AFTER)

    # ---- provider interface
    def get_ticket(self, ticket_id: int) -> ExternalTicket | None:
        raw = self._request("GET", f"/api/{self._app}/tickets/{int(ticket_id)}")
        return map_ticket(raw, self.include_people) if isinstance(raw, dict) else None

    def iter_tickets(self, *, max_items: int, page_size: int | None = None, **criteria) -> Iterator[ExternalTicket]:
        size, got = min(page_size or self.page_size, 500), 0
        self.last_skipped = 0
        for page in range(MAX_PAGES):
            body = {**criteria, "PageIndex": page, "PageSize": size}
            items = _items(self._request("POST", f"/api/{self._app}/tickets/search/paged", json=body))
            for raw in items:
                t = map_ticket(raw, self.include_people)
                if t is None:
                    self.last_skipped += 1
                    continue
                yield t
                got += 1
                if got >= max_items:
                    return
            if len(items) < size:
                return

    def get_ticket_feed(self, ticket_id: int) -> list[ExternalComment]:
        data = self._request("GET", f"/api/{self._app}/tickets/{int(ticket_id)}/feed")
        return [c for c in (map_feed_item(x, self.include_people) for x in _items(data)) if c]

    def list_statuses(self) -> list[str]:
        return [_text(x.get("Name"), 100) for x in _items(self._request("GET", f"/api/{self._app}/tickets/statuses")) if x.get("Name")]

    def search_articles(self, query: str, *, limit: int = 10) -> list[ExternalArticle]:
        data = self._request("POST", f"/api/{self._app}/knowledgebase/search", json={"SearchText": query[:300], "MaxResults": limit})
        return [a for a in (map_article(x) for x in _items(data)) if a][:limit]

    def get_article(self, article_id: int) -> ExternalArticle | None:
        raw = self._request("GET", f"/api/{self._app}/knowledgebase/{int(article_id)}")
        return map_article(raw) if isinstance(raw, dict) else None
