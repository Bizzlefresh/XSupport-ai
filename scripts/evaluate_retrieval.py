"""Evaluate similar-incident and article retrieval on the synthetic data. Writes data/evaluation/retrieval_report.json.

Protocol (no leakage):
- Ticket corpus  = primary-split TRAIN tickets. Queries = primary-split TEST tickets (validation tickets pick thresholds).
  A ticket is relevant if it comes from the same scenario family. Query phrasing templates differ from corpus templates.
- Article corpus = all sample articles (they are authored independently of tickets). Queries = TEST tickets whose family
  has a labelled article (data/knowledge/relevance_labels.json, author-assigned: see caveat in the report).
- Embedder/TF-IDF are fitted only on corpus text, never on queries.
- Weak-match threshold is chosen on VALIDATION queries and then applied once to TEST.
Run from repo root:  python scripts/evaluate_retrieval.py [--provider lsa|auto]
"""
import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ai.retrieval.embeddings import EmbeddingUnavailable, make_embedder  # noqa: E402
from app.ai.retrieval.index import METHODS, Doc, RetrievalIndex  # noqa: E402
from app.ai.retrieval.metrics import summarize  # noqa: E402
from app.ai.retrieval.text import article_doc_text, ticket_doc_text  # noqa: E402

OUT = ROOT / "data" / "evaluation" / "retrieval_report.json"
MIN_PRECISION, MIN_QUERIES = 0.8, 10


def load():
    tickets = json.load(open(ROOT / "data/synthetic/tickets.json"))["tickets"]
    arts = json.load(open(ROOT / "data/knowledge/articles.json"))["articles"]
    labels = json.load(open(ROOT / "data/knowledge/relevance_labels.json"))
    return tickets, arts, labels


def threshold_for_precision(scored: list[tuple[float, bool]]) -> float | None:
    """Lowest top-1 score such that answers at/above it have >= MIN_PRECISION precision on >= MIN_QUERIES queries."""
    best = None
    for t in sorted({s for s, _ in scored}):
        sel = [ok for s, ok in scored if s >= t]
        if len(sel) >= MIN_QUERIES and sum(sel) / len(sel) >= MIN_PRECISION:
            best = t
            break
    return None if best is None else round(float(best), 4)


def run_set(index, queries, relevant_of, kind, methods, k=5):
    results, lat = {}, {}
    for m in methods:
        per_q, top1, times = [], [], []
        for q in queries:
            hits, ms = index.timed_search(ticket_doc_text(q["subject"], q["description"]), m, kind, k)
            ranked = [h.doc.key for h in hits]
            rel = relevant_of(q)
            per_q.append((ranked, rel))
            top1.append((hits[0].score, hits[0].doc.key in rel) if hits else (0.0, False))
            times.append(ms)
        results[m] = (per_q, top1)
        lat[m] = round(statistics.median(times), 2)
    return results, lat


def evaluate(provider: str):
    tickets, arts, labels = load()
    fam2arts = labels["family_to_articles"]
    train = [t for t in tickets if t["split"] == "train"]
    val = [t for t in tickets if t["split"] == "validation"]
    test = [t for t in tickets if t["split"] == "test"]

    embedder, note = make_embedder(provider, "sentence-transformers/all-MiniLM-L6-v2")
    # ---- similar incidents
    docs = [Doc(f"ticket:{t['external_id']}", "ticket", i, ticket_doc_text(t["subject"], t["description"]),
                {"family": t["family_id"], "category": t["category"]}) for i, t in enumerate(train)]
    idx = RetrievalIndex(docs, embedder)
    fam_members = {}
    for d in docs:
        fam_members.setdefault(d.meta["family"], set()).add(d.key)
    rel_t = lambda q: fam_members.get(q["family_id"], set())  # noqa: E731
    res_t, lat_t = run_set(idx, test, rel_t, "ticket", METHODS)
    val_t, _ = run_set(idx, val, rel_t, "ticket", METHODS)
    # ---- articles (fresh embedder fitted on article text only, so queries/tickets never influence it)
    embedder_a, _ = make_embedder(provider, "sentence-transformers/all-MiniLM-L6-v2")
    adocs = [Doc(f"article:{a['slug']}", "article", i, article_doc_text(a["title"], a["problem_description"], a["steps"], a["tags"]))
             for i, a in enumerate(arts)]
    aidx = RetrievalIndex(adocs, embedder_a)
    rel_a = lambda q: {f"article:{s}" for s in fam2arts.get(q["family_id"], [])}  # noqa: E731
    lab_test = [q for q in test if rel_a(q)]
    unl_test = [q for q in test if not rel_a(q)]
    lab_val = [q for q in val if rel_a(q)]
    unl_val = [q for q in val if not rel_a(q)]
    res_a, lat_a = run_set(aidx, lab_test, rel_a, "article", METHODS)
    val_a, _ = run_set(aidx, lab_val, rel_a, "article", METHODS)
    # Queries with no matching article count as WRONG whenever an article is shown, so the threshold must also
    # keep out-of-scope tickets from getting a confident-looking suggestion.
    unl_val_scores = {m: [(aidx.search(ticket_doc_text(q["subject"], q["description"]), m, "article", 1)[0].score, False)
                          for q in unl_val] for m in METHODS}

    cat_of = {d.key: d.meta["category"] for d in docs}
    cat_q = {}
    for m in METHODS:
        ok = [cat_of[idx.search(ticket_doc_text(q["subject"], q["description"]), m, "ticket", 1)[0].doc.key] == q["category"] for q in test]
        cat_q[m] = round(sum(ok) / len(ok), 3)

    report = {
        "embedding": {"used": idx.embedder_name, "requested": provider, "fallback_reason": note},
        "protocol": {
            "ticket_corpus": f"{len(train)} primary-split train tickets", "ticket_queries": f"{len(test)} primary-split test tickets",
            "article_corpus": f"{len(arts)} original sample articles", "article_queries": f"{len(lab_test)} test tickets with a labelled article",
            "unlabelled_test_queries": len(unl_test),
            "relevance_ticket": "same scenario family (different phrasing template from every corpus ticket)",
            "relevance_article": "author-assigned family->article labels (data/knowledge/relevance_labels.json)",
            "threshold_selection": f"lowest top-1 score on validation with >={MIN_PRECISION:.0%} precision over >={MIN_QUERIES} queries, counting an article shown for a ticket that has no matching article as wrong",
        },
        "similar_incidents": {}, "articles": {}, "similar_incident_top1_same_category": cat_q, "thresholds": {"similar_incidents": {}, "articles": {}},
        "latency_ms_median": {"similar_incidents": lat_t, "articles": lat_a},
        "caveats": [
            "All data is synthetic and produced by the project's own generator, so these numbers show the pipeline works on its own data distribution, not real-world accuracy.",
            "Ticket relevance is defined by generator family; the generator reuses a small set of phrasings per family, so ticket retrieval is easier than it would be on real tickets.",
            "Article labels were assigned by the project author (an AI assistant) and have not been reviewed by a human.",
            "If embedding.used is 'lsa', the semantic scorer is local latent semantic analysis, not a pretrained sentence-embedding model.",
        ],
    }
    for _name, res, vres, store, kind in (("similar_incidents", res_t, val_t, report["similar_incidents"], "similar_incidents"),
                                          ("articles", res_a, val_a, report["articles"], "articles")):
        for m in METHODS:
            store[m] = summarize(res[m][0])
            report["thresholds"][kind][m] = threshold_for_precision(vres[m][1] + (unl_val_scores[m] if kind == "articles" else []))
    # behaviour of the weak-match threshold on TEST (article queries, incl. those with no matching article)
    gate = {}
    for m in METHODS:
        thr = report["thresholds"]["articles"][m]
        if thr is None:
            gate[m] = None
            continue
        shown_lab = [ok for s, ok in res_a[m][1] if s >= thr]
        shown_unl = 0
        for q in unl_test:
            hits = aidx.search(ticket_doc_text(q["subject"], q["description"]), m, "article", 1)
            shown_unl += bool(hits and hits[0].score >= thr)
        gate[m] = {"threshold": thr, "labelled_queries_answered": len(shown_lab),
                   "labelled_answer_precision": round(sum(shown_lab) / len(shown_lab), 3) if shown_lab else None,
                   "labelled_coverage": round(len(shown_lab) / len(lab_test), 3),
                   "unlabelled_queries_wrongly_answered": shown_unl, "unlabelled_queries": len(unl_test)}
    report["article_threshold_on_test"] = gate
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="lsa", choices=["lsa", "auto", "sentence_transformers"])
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    t0 = time.time()
    try:
        rep = evaluate(a.provider)
    except EmbeddingUnavailable as e:
        sys.exit(f"Embedding model unavailable: {e}")
    Path(a.out).write_text(json.dumps(rep, indent=1) + "\n")
    print(f"wrote {a.out} in {time.time() - t0:.1f}s; embedder={rep['embedding']['used']}")
    for sec in ("similar_incidents", "articles"):
        for m, v in rep[sec].items():
            print(f"{sec:18s} {m:9s} P@1={v['precision_at_1']} R@5={v['recall_at_5']} Hit@3={v['hit_at_3']} MRR={v['mrr']} {v['mrr_ci95']} nDCG@5={v['ndcg_at_5']}")
    print(json.dumps(rep["article_threshold_on_test"], indent=1))
