"""Evaluate the incident-burst rule against the generator's known incident bursts. Writes data/evaluation/incident_report.json.

Ground truth (from the generator, not visible to the detector): the tickets of a burst scenario family that were created
inside that scenario's single clustered morning window. The detector sees only ticket id, category and created_at.
The rule's parameters are fixed in advance (5 tickets / 3 hours) and are NOT tuned here; a sensitivity table shows what
happens if they were different. It is run on the main dataset and on 20 other generator seeds to count false alarms.
Run from repo root:  python scripts/evaluate_incidents.py
"""
import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from app.services.incidents import MIN_TICKETS, WINDOW_HOURS, detect_bursts  # noqa: E402
from generate_tickets import DEFAULT_ANCHOR, generate  # noqa: E402
from ticket_scenarios import FAMILIES  # noqa: E402

OUT = ROOT / "data" / "evaluation" / "incident_report.json"
BURST_FAMILIES = {f["id"]: f["burst"] for f in FAMILIES if f["burst"]}
SEEDS = list(range(100, 120))


def truth_clusters(rows: list[dict]) -> list[set[str]]:
    anchor = datetime.fromisoformat(DEFAULT_ANCHOR)
    days = {"net_outage": anchor - timedelta(days=23), "m365": anchor - timedelta(days=9)}
    out = []
    for fam, key in BURST_FAMILIES.items():
        lo = days[key].replace(hour=9, minute=0, second=0, microsecond=0)
        hi = lo + timedelta(hours=3)
        ids = {r["external_id"] for r in rows if r["family_id"] == fam and lo <= datetime.fromisoformat(r["created_at"]) <= hi}
        if ids:
            out.append(ids)
    return out


def score(rows: list[dict], window: float, min_t: int) -> dict:
    ext2num = {r["external_id"]: i for i, r in enumerate(rows)}
    detected = detect_bursts([(ext2num[r["external_id"]], r["category"], datetime.fromisoformat(r["created_at"])) for r in rows], window, min_t)
    truth = [{ext2num[e] for e in c} for c in truth_clusters(rows)]
    all_truth = set().union(*truth) if truth else set()
    flagged = {t for b in detected for t in b.ticket_ids}
    hit_truth = [any(set(b.ticket_ids) & t for b in detected) for t in truth]
    good = [b for b in detected if any(set(b.ticket_ids) & t for t in truth)]
    return {"truth_bursts": len(truth), "detected_bursts": len(detected), "truth_found": sum(hit_truth),
            "false_alarms": len(detected) - len(good),
            "ticket_recall": round(len(all_truth & flagged) / max(1, len(all_truth)), 3),
            "ticket_precision": round(len(all_truth & flagged) / max(1, len(flagged)), 3)}


def evaluate() -> dict:
    main_rows = json.load(open(ROOT / "data/synthetic/tickets.json"))["tickets"]
    main = score(main_rows, WINDOW_HOURS, MIN_TICKETS)
    seeds = [score(generate(seed=s)["tickets"], WINDOW_HOURS, MIN_TICKETS) for s in SEEDS]
    sens = {}
    for w, m in [(3, 4), (3, 5), (3, 6), (3, 8), (1, 5), (6, 5), (6, 8)]:
        sens[f"{m} tickets / {w} h"] = {"main_dataset": {k: v for k, v in score(main_rows, w, m).items() if k in ("truth_found", "false_alarms")},
                                        "false_alarms_over_20_seeds": sum(score(generate(seed=s)["tickets"], w, m)["false_alarms"] for s in SEEDS)}
    return {
        "rule": f"{MIN_TICKETS} or more tickets in one category within {WINDOW_HOURS} hours (fixed in advance, not tuned)",
        "main_dataset": main,
        "other_seeds": {"seeds": f"{SEEDS[0]}..{SEEDS[-1]}", "datasets": len(seeds),
                        "ticket_recall_mean": round(sum(s["ticket_recall"] for s in seeds) / len(seeds), 3),
                        "ticket_precision_mean": round(sum(s["ticket_precision"] for s in seeds) / len(seeds), 3),
                        "bursts_present": sum(s["truth_bursts"] for s in seeds), "bursts_found": sum(s["truth_found"] for s in seeds),
                        "false_alarms": sum(s["false_alarms"] for s in seeds)},
        "sensitivity": sens,
        "caveats": [
            "The bursts are produced by the project's own generator as tight one-morning clusters, so detecting them is easy. This shows the rule works on that shape, not that it would find real incidents.",
            "Other seeds use the same generator and the same two burst scenarios, so they test false alarms from ordinary ticket timing, not new kinds of incident.",
            "The detector uses category and time only. An incident that spreads over a day, or across categories, would be missed.",
            "Real ticket arrival is bursty for ordinary reasons (start of term, Monday mornings), which could cause more false alarms than seen here.",
        ],
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    rep = evaluate()
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    print(json.dumps({k: rep[k] for k in ("main_dataset", "other_seeds")}, indent=1))
    print(json.dumps(rep["sensitivity"], indent=1))
