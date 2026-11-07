"""Ranking metrics. `ranked` is a list of doc identifiers in rank order; `relevant` is the set of correct identifiers."""
import math

import numpy as np


def precision_at_k(ranked: list, relevant: set, k: int) -> float:
    return sum(1 for r in ranked[:k] if r in relevant) / k


def recall_at_k(ranked: list, relevant: set, k: int) -> float:
    return sum(1 for r in ranked[:k] if r in relevant) / len(relevant) if relevant else 0.0


def hit_at_k(ranked: list, relevant: set, k: int) -> float:
    return float(any(r in relevant for r in ranked[:k]))


def reciprocal_rank(ranked: list, relevant: set) -> float:
    for i, r in enumerate(ranked, 1):
        if r in relevant:
            return 1.0 / i
    return 0.0


def ndcg_at_k(ranked: list, relevant: set, k: int) -> float:
    dcg = sum(1.0 / math.log2(i + 1) for i, r in enumerate(ranked[:k], 1) if r in relevant)
    ideal = sum(1.0 / math.log2(i + 1) for i in range(1, min(len(relevant), k) + 1))
    return dcg / ideal if ideal else 0.0


def summarize(per_query: list[tuple[list, set]], ks=(1, 3, 5), seed: int = 42, n_boot: int = 1000) -> dict:
    """Mean metrics plus a bootstrap 95% CI (over queries) for MRR and Hit@1."""
    rr = np.array([reciprocal_rank(r, rel) for r, rel in per_query])
    h1 = np.array([hit_at_k(r, rel, 1) for r, rel in per_query])
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(per_query), size=(n_boot, len(per_query)))

    def ci(v: np.ndarray) -> list[float]:
        m = v[idx].mean(axis=1)
        return [round(float(np.percentile(m, 2.5)), 3), round(float(np.percentile(m, 97.5)), 3)]

    out = {"queries": len(per_query), "mrr": round(float(rr.mean()), 3), "mrr_ci95": ci(rr),
           "hit_at_1_ci95": ci(h1)}
    for k in ks:
        out[f"precision_at_{k}"] = round(float(np.mean([precision_at_k(r, rel, k) for r, rel in per_query])), 3)
        out[f"recall_at_{k}"] = round(float(np.mean([recall_at_k(r, rel, k) for r, rel in per_query])), 3)
        out[f"hit_at_{k}"] = round(float(np.mean([hit_at_k(r, rel, k) for r, rel in per_query])), 3)
        out[f"ndcg_at_{k}"] = round(float(np.mean([ndcg_at_k(r, rel, k) for r, rel in per_query])), 3)
    return out
