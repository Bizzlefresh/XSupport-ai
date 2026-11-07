"""Evaluate the troubleshooting assistant's decisions on the synthetic test split. Writes data/evaluation/assistant_report.json.

What is measured: given a ticket, does the assistant (a) offer cited steps from a relevant article when one exists and
(b) decline when none exists? It uses the same articles, labels, corpus and validation-chosen threshold as
scripts/evaluate_retrieval.py (run that first). It does NOT measure whether following the steps fixes anything.
Run from repo root:  python scripts/evaluate_assistant.py
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "scripts"))

from app.ai.retrieval.embeddings import make_embedder  # noqa: E402
from app.ai.retrieval.index import Doc, RetrievalIndex  # noqa: E402
from app.ai.retrieval.text import article_doc_text, ticket_doc_text  # noqa: E402
from app.ai.troubleshooting import assistant as core  # noqa: E402
from evaluate_retrieval import load  # noqa: E402

OUT = ROOT / "data" / "evaluation" / "assistant_report.json"
METHOD = "hybrid"


def boot_ci(v: np.ndarray, seed=42, n=1000) -> list[float]:
    idx = np.random.default_rng(seed).integers(0, len(v), size=(n, len(v)))
    m = v[idx].mean(axis=1)
    return [round(float(np.percentile(m, 2.5)), 3), round(float(np.percentile(m, 97.5)), 3)]


def evaluate(provider: str) -> dict:
    tickets, arts, labels = load()
    rep = json.loads((ROOT / "data/evaluation/retrieval_report.json").read_text())
    thr = rep["thresholds"]["articles"][METHOD]
    fam2arts = labels["family_to_articles"]
    by_slug = {a["slug"]: a for a in arts}
    train = [t for t in tickets if t["split"] == "train"]
    test = [t for t in tickets if t["split"] == "test"]

    emb_t, _ = make_embedder(provider, "sentence-transformers/all-MiniLM-L6-v2")
    if emb_t.name != rep["embedding"]["used"]:
        raise SystemExit(f"retrieval_report.json used '{rep['embedding']['used']}' but this run uses '{emb_t.name}'; "
                         "re-run scripts/evaluate_retrieval.py with the same --provider first")
    tdocs = [Doc(f"ticket:{t['external_id']}", "ticket", i, ticket_doc_text(t["subject"], t["description"]),
                 {"family": t["family_id"], "title": t["subject"], "ext": t["external_id"], "res": t["resolution_summary"],
                  "status": t["status"]}) for i, t in enumerate(train)]
    tidx = RetrievalIndex(tdocs, emb_t)
    emb_a, _ = make_embedder(provider, "sentence-transformers/all-MiniLM-L6-v2")
    adocs = [Doc(f"article:{a['slug']}", "article", i, article_doc_text(a["title"], a["problem_description"], a["steps"], a["tags"]),
                 {"slug": a["slug"]}) for i, a in enumerate(arts)]
    aidx = RetrievalIndex(adocs, emb_a)

    rows = []
    for q in test:
        text = ticket_doc_text(q["subject"], q["description"])
        cands = [core.ArticleEvidence(h.doc.ref_id, by_slug[h.doc.meta["slug"]]["title"], h.score, "unvalidated", None,
                                      by_slug[h.doc.meta["slug"]]["steps"], by_slug[h.doc.meta["slug"]]["escalation"], "original_sample")
                 for h in aidx.search(text, METHOD, "article", 5)]
        past = [core.PastResolution(h.doc.ref_id, h.doc.meta["ext"], h.doc.meta["title"], h.score, h.doc.meta["res"])
                for h in tidx.search(text, METHOD, "ticket", 5)
                if h.doc.meta["status"] in ("resolved", "closed") and h.doc.meta["res"]]
        s = core.decide(cands, past, thr)
        relevant = {by_slug[x]["title"] for x in fam2arts.get(q["family_id"], [])}
        shown_titles = [a.title for a in s.articles if a.steps]
        # every shown step must be a verbatim step of the cited article (extractive guarantee)
        src = {a["title"]: set(a["steps"]) for a in arts}
        cited_ok = all(st in src[a.title] for a in s.articles for st in a.steps)
        rows.append({"labelled": bool(relevant), "answered": s.status != "insufficient_evidence",
                     "correct": bool(shown_titles and shown_titles[0] in relevant), "cited_ok": cited_ok,
                     "past_same_family": any(tdocs[p.ticket_id].meta["family"] == q["family_id"] for p in s.past_resolutions),
                     "has_past": bool(s.past_resolutions), "status": s.status})

    lab = [r for r in rows if r["labelled"]]
    unl = [r for r in rows if not r["labelled"]]
    safe = np.array([(r["answered"] and r["correct"]) if r["labelled"] else (not r["answered"]) for r in rows], dtype=float)
    answered_lab = [r for r in lab if r["answered"]]
    past_rows = [r for r in rows if r["has_past"]]
    report = {
        "assistant_version": core.ASSISTANT_VERSION,
        "embedding": rep["embedding"]["used"], "method": METHOD, "article_threshold": thr,
        "protocol": {"queries": len(rows), "with_matching_article": len(lab), "without_matching_article": len(unl),
                     "note": "Threshold was chosen on validation data (see retrieval_report.json) and applied once to test."},
        "results": {
            "safe_outcome_rate": round(float(safe.mean()), 3), "safe_outcome_ci95": boot_ci(safe),
            "safe_outcome_definition": "correct cited steps offered when a matching article exists, or declined when none exists",
            "answered_when_article_exists": round(len(answered_lab) / len(lab), 3),
            "correct_when_answered": round(sum(r["correct"] for r in answered_lab) / len(answered_lab), 3) if answered_lab else None,
            "wrongly_declined_when_article_exists": sum(not r["answered"] for r in lab),
            "declined_when_no_article": sum(not r["answered"] for r in unl), "no_article_queries": len(unl),
            "wrongly_answered_when_no_article": sum(r["answered"] for r in unl),
            "step_citation_integrity": round(float(np.mean([r["cited_ok"] for r in rows])), 3),
            "past_resolution_from_same_scenario": round(sum(r["past_same_family"] for r in past_rows) / len(past_rows), 3) if past_rows else None,
            "queries_with_past_resolutions": len(past_rows),
        },
        "caveats": [
            "Synthetic data from the project's own generator; article labels were assigned by the project author and not reviewed by a human.",
            "This measures whether the assistant picks and cites the right article or declines. It does not measure whether following the steps resolves a ticket.",
            "Step citation integrity is true by construction (steps are copied from articles); it is checked, not an achievement.",
            "Small samples: see the interval. Real tickets would likely score lower.",
        ],
    }
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="lsa", choices=["lsa", "auto", "sentence_transformers"])
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    rep = evaluate(a.provider)
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    print(json.dumps(rep["results"], indent=1))
