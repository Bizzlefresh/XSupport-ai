"""Provider-independent records. Only the fields XSupport needs; everything else a provider returns is dropped."""
from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class ExternalTicket:
    provider: str
    external_id: str
    title: str
    description: str          # plain text
    status: str               # new | open | pending | resolved | closed
    priority: str             # critical | high | medium | low
    category_name: str | None
    created_at: datetime | None
    modified_at: datetime | None
    completed_at: datetime | None
    requestor: str | None = None   # only populated when people fields are explicitly enabled
    assignee: str | None = None


@dataclass(frozen=True)
class ExternalComment:
    created_at: datetime | None
    body: str                 # plain text; private entries are never returned
    author: str | None = None


@dataclass(frozen=True)
class ExternalArticle:
    provider: str
    external_id: str
    title: str
    body: str                 # plain text
    category_name: str | None
    status: str | None
    modified_at: datetime | None


@dataclass
class IntegrationHealth:
    state: str = "disabled"   # disabled | misconfigured | ready | degraded | paused
    requests: int = 0
    failures: int = 0
    consecutive_failures: int = 0
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    last_error_kind: str | None = None
    reasons: list[str] = field(default_factory=list)
