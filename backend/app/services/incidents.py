"""Incident-burst detection: many tickets in one category inside a short window.

A transparent rule, not a model. For each category, a burst is any run of tickets in which at least `min_tickets` fall
within `window_hours`; overlapping windows are merged. The defaults (5 tickets in 3 hours) were chosen in advance, not
tuned on the synthetic data. It needs only ticket id, category and creation time.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

WINDOW_HOURS = 3
MIN_TICKETS = 5


@dataclass
class Burst:
    category: str
    start: datetime
    end: datetime
    ticket_ids: list[int]


def detect_bursts(rows: list[tuple[int, str, datetime]], window_hours: float = WINDOW_HOURS,
                  min_tickets: int = MIN_TICKETS) -> list[Burst]:
    if min_tickets < 2 or window_hours <= 0:
        raise ValueError("min_tickets must be >= 2 and window_hours > 0")
    window = timedelta(hours=window_hours)
    by_cat: dict[str, list[tuple[datetime, int]]] = {}
    for tid, cat, created in rows:
        by_cat.setdefault(cat, []).append((created, tid))
    out: list[Burst] = []
    for cat, items in by_cat.items():
        items.sort()
        n = len(items)
        spans: list[tuple[int, int]] = []
        for i in range(n):  # noqa: B007
            j = i
            while j + 1 < n and items[j + 1][0] - items[i][0] <= window:
                j += 1
            if j - i + 1 >= min_tickets:
                if spans and i <= spans[-1][1]:  # overlaps the previous window: merge
                    spans[-1] = (spans[-1][0], max(spans[-1][1], j))
                else:
                    spans.append((i, j))
        for a, b in spans:
            out.append(Burst(cat, items[a][0], items[b][0], [tid for _, tid in items[a:b + 1]]))
    return sorted(out, key=lambda b: b.start)
