"""Reproducible synthetic helpdesk ticket generator.

    python scripts/generate_tickets.py [--seed 42] [--anchor 2026-11-02T16:00:00+00:00]

All tickets are invented. Synthetic accuracy says nothing about real-world accuracy.
Two leakage-safe splits are written to every ticket (see docs/methodology.md):
  split        PRIMARY. By phrasing template: a template (subject+description wording) is wholly in train or
               wholly in validation/test, so near-duplicates never straddle splits, but the same problem type
               can appear in train in different words. Models "known problems, new wording".
  split_novel  STRESS TEST. By scenario family: whole problem types held out. Models "never-seen problem types".
"""
import argparse
import json
import math
import random
import re
import string
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from ticket_scenarios import FAMILIES, SCOPE, SLOTS  # noqa: E402

DEFAULT_SEED = 42
DEFAULT_ANCHOR = "2026-11-02T16:00:00+00:00"
SPAN_DAYS = 180
LEVELS = ["low", "medium", "high", "critical"]
TECHS = ["tech0", "tech1", "tech2", "tech3", "tech4"]
MEDIAN_HOURS = {"critical": 3, "high": 8, "medium": 24, "low": 48}
GREETINGS = ["Hi,", "Hello,", "Hi IT,", "Good morning,", "Hey team,", "URGENT:", "Please help -", ""]
CLOSINGS = ["Thanks!", "Thanks in advance.", "Appreciate any help.", "Regards", "", "", ""]


def _families_by_category(rng: random.Random) -> dict[str, list[str]]:
    by_cat: dict[str, list[str]] = {}
    for f in FAMILIES:
        by_cat.setdefault(f["category"], []).append(f["id"])
    for cat in sorted(by_cat):
        by_cat[cat] = sorted(by_cat[cat])
        rng.shuffle(by_cat[cat])
    return by_cat


def assign_novel_splits(by_cat: dict[str, list[str]]) -> dict[str, str]:
    """Stress-test split: per category one whole family to test, one to validation, rest to train."""
    splits = {}
    for cat in sorted(by_cat):
        ids = by_cat[cat]
        splits[ids[0]], splits[ids[1]] = "test", "validation"
        for i in ids[2:]:
            splits[i] = "train"
    return splits


def assign_family_roles(by_cat: dict[str, list[str]]) -> dict[str, str]:
    """Primary split: every family's second template goes to evaluation, alternating test / validation
    across the category's families (so validation and test never share a problem or a wording);
    every family's first template is training data."""
    roles = {}
    for cat in sorted(by_cat):
        ids = by_cat[cat]
        for n, fid in enumerate(ids):
            roles[fid] = "test" if n % 2 == 0 else "validation"
    return roles


def template_split(role: str, template_index: int) -> str:
    return "train" if template_index == 0 or role == "train" else role


def typo(text: str, rng: random.Random) -> str:
    words = text.split(" ")
    idx = [i for i, w in enumerate(words) if len(w) > 4 and w.isalpha()]
    for i in rng.sample(idx, min(2, len(idx))):
        w, j = words[i], rng.randrange(1, len(words[i]) - 2)
        words[i] = w[:j] + w[j + 1] + w[j] + w[j + 2:]
    return " ".join(words)


def style(desc: str, rng: random.Random) -> str:
    if rng.random() < 0.08:  # terse: first sentence only
        desc = re.split(r"(?<=[.!?]) ", desc)[0]
    if rng.random() < 0.6:
        desc = f"{rng.choice(GREETINGS)} {desc} {rng.choice(CLOSINGS)}".strip()
    if rng.random() < 0.10:
        desc = typo(desc, rng)
    if rng.random() < 0.06:
        desc = desc.lower()
    return re.sub(r"\s+", " ", desc).strip()


def fill(template: str, ctx: dict) -> str:
    return string.Formatter().vformat(template, (), ctx)


def shift(level: str, n: int) -> str:
    return LEVELS[max(0, min(3, LEVELS.index(level) + n))]


def when(rng: random.Random, anchor: datetime) -> datetime:
    while True:
        d = anchor - timedelta(days=rng.randrange(0, SPAN_DAYS))
        if d.weekday() >= 5 and rng.random() < 0.7:
            continue
        hour = max(8, min(17, round(rng.triangular(8, 17, 11))))
        return d.replace(hour=hour, minute=rng.randrange(60), second=rng.randrange(60), microsecond=0)


def pick_status(age_days: float, rng: random.Random) -> str:
    if age_days < 2:
        w = (("new", .35), ("open", .35), ("pending", .15), ("resolved", .15))
    elif age_days < 14:
        w = (("open", .2), ("pending", .2), ("resolved", .35), ("closed", .25))
    else:
        w = (("open", .03), ("pending", .02), ("resolved", .3), ("closed", .65))
    return rng.choices([s for s, _ in w], [p for _, p in w])[0]


def generate(seed: int = DEFAULT_SEED, anchor_iso: str = DEFAULT_ANCHOR) -> dict:
    rng = random.Random(seed)
    anchor = datetime.fromisoformat(anchor_iso)
    by_cat = _families_by_category(rng)
    novel = assign_novel_splits(by_cat)
    roles = assign_family_roles(by_cat)
    for fam in FAMILIES:
        assert len(fam["subjects"]) == 2 and len(fam["descriptions"]) == 2, fam["id"]
    burst_days = {"net_outage": anchor - timedelta(days=23), "m365": anchor - timedelta(days=9)}
    rows = []
    for fam in FAMILIES:
        n = rng.randint(12, 15) if fam["burst"] else rng.randint(7, 10)
        for k in range(n):
            many = rng.random() < fam["many_p"]
            ctx = {key: rng.choice(vals) for key, vals in SLOTS.items()}
            ctx["scope"] = rng.choice(SCOPE["many" if many else "single"])
            j = rng.randrange(2)  # phrasing template: subject j is always paired with description j
            subject = fill(fam["subjects"][j], ctx)
            desc = style(fill(fam["descriptions"][j], ctx), rng)
            if fam["burst"] and k < int(n * 0.75):  # clustered incident burst (one day, same morning)
                base = burst_days[fam["burst"]].replace(hour=9, minute=0, second=0, microsecond=0)
                created = base + timedelta(minutes=rng.randrange(0, 180))
            else:
                created = when(rng, anchor)
            prio = shift(fam["priority"], 1 if many else 0)
            if rng.random() < 0.08:
                prio = shift(prio, rng.choice([-1, 1]))
            status = pick_status((anchor - created).total_seconds() / 86400, rng)
            resolved_at = resolution = None
            if status in ("resolved", "closed"):
                hrs = math.exp(rng.gauss(math.log(MEDIAN_HOURS[prio]), 0.8))
                resolved_at = min(created + timedelta(hours=hrs), anchor)
                resolution = rng.choice(fam["resolutions"]) if rng.random() > 0.02 else None
                if rng.random() < 0.02:  # deliberate data-quality flaw: resolved but no timestamp
                    resolved_at = None
            assignee = None if (status == "new" and rng.random() < 0.9) else rng.choice(TECHS)
            rows.append({
                "subject": subject, "description": desc, "category": fam["category"], "priority": prio,
                "status": status, "assignee_key": assignee, "created_at": created.isoformat(),
                "resolved_at": resolved_at.isoformat() if resolved_at else None,
                "resolution_summary": resolution, "family_id": fam["id"], "template_id": f"{fam['id']}:{j}",
                "split": template_split(roles[fam["id"]], j), "split_novel": novel[fam["id"]],
            })
    rows.sort(key=lambda r: r["created_at"])
    for i, r in enumerate(rows, 1):
        r["external_id"] = f"SYN-{i:04d}"
    return {
        "meta": {
            "generator": "scripts/generate_tickets.py", "seed": seed, "anchor": anchor_iso,
            "count": len(rows), "families": len(FAMILIES),
            "split_counts": dict(Counter(r["split"] for r in rows)),
            "split_novel_counts": dict(Counter(r["split_novel"] for r in rows)),
            "templates": len({r["template_id"] for r in rows}),
            "category_counts": dict(Counter(r["category"] for r in rows)),
            "disclaimer": "Entirely synthetic. Not StFX data. Performance on this data does not "
                          "establish real-world accuracy.",
        },
        "tickets": rows,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--anchor", default=DEFAULT_ANCHOR)
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[1] / "data/synthetic/tickets.json"))
    a = ap.parse_args()
    data = generate(a.seed, a.anchor)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(data["meta"], indent=1))


if __name__ == "__main__":
    main()
