"""Classification metrics, calibration and threshold selection (pure functions)."""
import numpy as np
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support


def summarize(y_true: list[str], y_pred: list[str], labels: list[str]) -> dict:
    p, r, f, s = precision_recall_fscore_support(y_true, y_pred, labels=labels, zero_division=0)
    mp, mr, mf, _ = precision_recall_fscore_support(y_true, y_pred, labels=labels, average="macro", zero_division=0)
    return {
        "n": len(y_true),
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_precision": round(float(mp), 4),
        "macro_recall": round(float(mr), 4),
        "macro_f1": round(float(mf), 4),
        "per_category": {
            lab: {"precision": round(float(p[i]), 4), "recall": round(float(r[i]), 4),
                  "f1": round(float(f[i]), 4), "support": int(s[i])}
            for i, lab in enumerate(labels)
        },
        "confusion_matrix": {"labels": labels,
                             "matrix": confusion_matrix(y_true, y_pred, labels=labels).tolist()},
    }


def calibration(confidence: np.ndarray, correct: np.ndarray, bins: int = 5) -> dict:
    """Expected calibration error with equal-width bins over [0, 1]."""
    edges = np.linspace(0.0, 1.0, bins + 1)
    rows, ece, n = [], 0.0, len(confidence)
    for lo, hi in zip(edges[:-1], edges[1:], strict=True):
        mask = (confidence >= lo) & ((confidence < hi) if hi < 1 else (confidence <= hi))
        if mask.sum() == 0:
            continue
        conf, acc = float(confidence[mask].mean()), float(correct[mask].mean())
        ece += mask.sum() / n * abs(conf - acc)
        rows.append({"range": f"{lo:.1f}-{hi:.1f}", "n": int(mask.sum()),
                     "mean_confidence": round(conf, 3), "accuracy": round(acc, 3)})
    return {"ece": round(ece, 4), "bins": rows}


def choose_threshold(confidence: np.ndarray, correct: np.ndarray, target_precision: float = 0.9,
                     grid: tuple[float, ...] = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8), fallback: float = 0.5) -> float:
    """Lowest confidence threshold at which accepted predictions reach the target precision.

    Chosen on validation data only. If no threshold qualifies, use a conservative fallback.
    """
    for t in grid:
        mask = confidence >= t
        if mask.sum() >= 10 and correct[mask].mean() >= target_precision:
            return t
    return fallback


def at_threshold(confidence: np.ndarray, correct: np.ndarray, threshold: float) -> dict:
    mask = confidence >= threshold
    return {
        "threshold": threshold,
        "coverage": round(float(mask.mean()), 4),
        "accuracy_when_confident": round(float(correct[mask].mean()), 4) if mask.any() else None,
        "sent_to_manual_review": int((~mask).sum()),
        "errors_caught_by_threshold": int(((~mask) & (~correct)).sum()),
        "total_errors": int((~correct).sum()),
    }


def bootstrap_ci(y_true: list[str], preds: dict[str, list[str]], labels: list[str], n_boot: int = 1000,
                 seed: int = 42) -> dict:
    """95% percentile bootstrap CIs for accuracy and macro-F1 per model, plus the paired accuracy
    difference between the first two models (same resamples). Small test sets are noisy; report this."""
    rng = np.random.default_rng(seed)
    yt = np.array(y_true)
    names = list(preds)
    arr = {k: np.array(v) for k, v in preds.items()}
    acc = {k: [] for k in names}
    f1 = {k: [] for k in names}
    for _ in range(n_boot):
        idx = rng.integers(0, len(yt), len(yt))
        for k in names:
            acc[k].append(float((arr[k][idx] == yt[idx]).mean()))
            f1[k].append(precision_recall_fscore_support(yt[idx], arr[k][idx], labels=labels, average="macro",
                                                         zero_division=0)[2])
    out = {k: {"accuracy_95ci": [round(float(np.percentile(acc[k], 2.5)), 3), round(float(np.percentile(acc[k], 97.5)), 3)],
               "macro_f1_95ci": [round(float(np.percentile(f1[k], 2.5)), 3), round(float(np.percentile(f1[k], 97.5)), 3)]}
           for k in names}
    if len(names) >= 2:
        d = np.array(acc[names[0]]) - np.array(acc[names[1]])
        out["paired_accuracy_difference"] = {
            "models": f"{names[0]} minus {names[1]}", "mean": round(float(d.mean()), 3),
            "95ci": [round(float(np.percentile(d, 2.5)), 3), round(float(np.percentile(d, 97.5)), 3)],
            "interpretation": "interval includes 0 => no reliable difference at this sample size"
            if np.percentile(d, 2.5) <= 0 <= np.percentile(d, 97.5) else "interval excludes 0",
        }
    return out
