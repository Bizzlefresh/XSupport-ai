"""Training and evaluation for the ticket category classifier (RQ1).

Protocol (see docs/methodology.md):
  * PRIMARY split ("split"): by phrasing template. No wording appears in two splits, but problem
    types recur in new words, which is how a helpdesk actually sees tickets.
  * STRESS split ("split_novel"): whole problem types held out. Reported separately for every
    model, using the hyperparameters chosen on the primary split (nothing is re-tuned on it).
  * Hyperparameters and the deployed model are chosen on the primary VALIDATION split only.
  * The TEST splits are evaluated once, after selection, and never used to tune anything.
  * The deployed artifact is the exact train-only model that was evaluated.
"""
import hashlib
import json
import platform
import time
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

from app.ai.classification import metrics
from app.ai.classification.text import build_text

SEED = 42
LR_GRID = [1.0, 3.0, 10.0, 30.0, 100.0]
SVM_GRID = [0.3, 1.0, 3.0, 10.0, 30.0]
MODEL_NAME = "tfidf_logreg"


def tfidf() -> FeatureUnion:
    """Word 1-2 grams plus character 2-5 grams. Character n-grams were adopted after a validation-only
    comparison (word-only LR 0.67 -> 0.76 macro-F1); they help with typos and word-form variation."""
    return FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, strip_accents="unicode")),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, strip_accents="unicode")),
    ])


def make_pipeline(kind: str, c: float | None = None) -> Pipeline:
    if kind == "majority":
        return Pipeline([("tfidf", tfidf()), ("clf", DummyClassifier(strategy="most_frequent"))])
    if kind == "tfidf_logreg":
        clf = LogisticRegression(C=c, max_iter=2000, class_weight="balanced", random_state=SEED)
    elif kind == "tfidf_svm":
        # LinearSVC has no probabilities; sigmoid calibration provides them.
        clf = CalibratedClassifierCV(LinearSVC(C=c, class_weight="balanced", max_iter=20000, random_state=SEED), method="sigmoid", cv=3)
    else:
        raise ValueError(kind)
    return Pipeline([("tfidf", tfidf()), ("clf", clf)])


def load_dataset(path: Path, key: str = "split") -> tuple[dict, dict[str, dict]]:
    raw = path.read_bytes()
    data = json.loads(raw)
    split: dict[str, dict] = defaultdict(lambda: {"x": [], "y": [], "family": [], "template": [], "id": []})
    for t in data["tickets"]:
        s = split[t[key]]
        s["x"].append(build_text(t["subject"], t["description"]))
        s["y"].append(t["category"])
        s["family"].append(t["family_id"])
        s["template"].append(t["template_id"])
        s["id"].append(t["external_id"])
    return {"sha256": hashlib.sha256(raw).hexdigest(), "meta": data["meta"]}, dict(split)


def _eval(model: Pipeline, s: dict, labels: list[str]) -> tuple[dict, np.ndarray, np.ndarray, list[str]]:
    proba = model.predict_proba(s["x"])
    classes = list(model.classes_)
    pred = [classes[i] for i in proba.argmax(axis=1)]
    conf = proba.max(axis=1)
    correct = np.array([a == b for a, b in zip(pred, s["y"], strict=True)])
    return metrics.summarize(s["y"], pred, labels), conf, correct, pred


def _macro_f1(model: Pipeline, s: dict, labels: list[str]) -> float:
    return _eval(model, s, labels)[0]["macro_f1"]


def latency_ms(model: Pipeline, texts: list[str], repeats: int = 3) -> dict:
    """Single-ticket prediction latency on this machine (machine-dependent)."""
    times = []
    for _ in range(repeats):
        for t in texts[:50]:
            t0 = time.perf_counter()
            model.predict_proba([t])
            times.append((time.perf_counter() - t0) * 1000)
    return {"mean_ms": round(float(np.mean(times)), 2), "p95_ms": round(float(np.percentile(times, 95)), 2),
            "samples": len(times)}


def train_and_evaluate(dataset_path: Path, artifact_dir: Path | None = None, report_path: Path | None = None) -> dict:
    ds, split = load_dataset(dataset_path)
    _, novel = load_dataset(dataset_path, "split_novel")
    train, val, test = split["train"], split["validation"], split["test"]
    labels = sorted(set(train["y"]) | set(val["y"]) | set(test["y"]))

    candidates: dict[str, dict] = {}
    # 1) Reference: majority class (sanity floor)
    maj = make_pipeline("majority").fit(train["x"], train["y"])
    candidates["majority_baseline"] = {"model": maj, "params": {}, "kind": "majority"}
    # 2) Tune each real model on validation macro-F1 only
    for kind, grid in (("tfidf_logreg", LR_GRID), ("tfidf_svm", SVM_GRID)):
        best = None
        for c in grid:
            m = make_pipeline(kind, c).fit(train["x"], train["y"])
            f1 = _macro_f1(m, val, labels)
            if best is None or f1 > best[0]:  # strict >: ties keep the smaller (more regularised) C
                best = (f1, c, m)
        candidates[kind] = {"model": best[2], "params": {"C": best[1]}, "kind": kind, "validation_macro_f1": best[0]}

    # Deployed model: best validation macro-F1 among real models; ties go to the baseline (logreg).
    real = ["tfidf_logreg", "tfidf_svm"]
    chosen = max(real, key=lambda k: (candidates[k]["validation_macro_f1"], k == "tfidf_logreg"))
    final = candidates[chosen]["model"]
    _, vconf, vcorrect, _ = _eval(final, val, labels)
    threshold = metrics.choose_threshold(vconf, vcorrect)

    models_report = {}
    for name, cand in candidates.items():
        v, vc, vk, _ = _eval(cand["model"], val, labels)
        t, tc, tk, tp = _eval(cand["model"], test, labels)  # test evaluated once per model, after selection
        entry = {"params": cand["params"], "validation": {k: v[k] for k in ("accuracy", "macro_precision", "macro_recall", "macro_f1")},
                 "test": t, "calibration_test": metrics.calibration(tc, tk), "threshold_test": metrics.at_threshold(tc, tk, threshold)}
        nm = make_pipeline(cand["kind"], cand["params"].get("C")).fit(novel["train"]["x"], novel["train"]["y"])
        nt, _, _, _ = _eval(nm, novel["test"], labels)
        entry["stress_novel_problem_types_test"] = {k: nt[k] for k in ("n", "accuracy", "macro_precision", "macro_recall", "macro_f1")}
        models_report[name] = entry

    test_preds = {n: _eval(candidates[n]["model"], test, labels)[3] for n in ("tfidf_logreg", "tfidf_svm", "majority_baseline")}
    uncertainty = metrics.bootstrap_ci(test["y"], test_preds, labels)

    # Error analysis for the deployed model
    _, tconf, tcorrect, tpred = _eval(final, test, labels)
    errors = [{"id": test["id"][i], "family": test["family"][i], "true": test["y"][i], "predicted": tpred[i],
               "confidence": round(float(tconf[i]), 3), "text": test["x"][i][:160]}
              for i in range(len(tpred)) if not tcorrect[i]]
    fam_acc = defaultdict(list)
    for fam, ok in zip(test["family"], tcorrect, strict=True):
        fam_acc[fam].append(bool(ok))
    version = f"v1-{ds['sha256'][:8]}"

    report = {
        "task": "ticket category classification",
        "disclaimer": "Synthetic data. These numbers do not establish real-world accuracy.",
        "dataset": {"file": dataset_path.name, "sha256": ds["sha256"], "generator_seed": ds["meta"]["seed"],
                    "sizes": {k: len(v["y"]) for k, v in split.items()},
                    "sizes_stress": {k: len(v["y"]) for k, v in novel.items()}, "labels": labels},
        "protocol": "Primary: template-level split (new wording of known problems). Stress: family-level split (unseen "
                    "problem types). Hyperparameters and model choice on primary validation only; test evaluated once.",
        "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__, "numpy": np.__version__},
        "deployed": {"name": chosen, "version": version, "params": candidates[chosen]["params"], "confidence_threshold": threshold,
                     "threshold_rule": "lowest threshold on validation with >=90% precision among accepted (min 10 tickets)"},
        "models": models_report,
        "test_uncertainty_bootstrap": uncertainty,
        "deployed_test_errors": errors,
        "deployed_test_family_accuracy": {k: round(sum(v) / len(v), 3) for k, v in sorted(fam_acc.items())},
        "latency": latency_ms(final, test["x"]),
        "limitations": [
            "Single synthetic dataset written by one author; vocabulary overlaps within categories more than real tickets would.",
            "Primary test tickets are re-worded versions of problem types seen in training; "
            "the stress split shows how much worse unseen problem types are.",
            "Only 90 phrasing templates exist, so test tickets share wording patterns (greetings, typos, slots) with training ones.",
            "SVM calibration uses stratified (not family-grouped) folds inside training data.",
            "Sentence-embedding classifier is deferred to Phase 4 with the embedding infrastructure.",
        ],
    }
    if artifact_dir is not None:
        artifact_dir.mkdir(parents=True, exist_ok=True)
        joblib.dump(final, artifact_dir / "model.joblib")
        (artifact_dir / "metadata.json").write_text(json.dumps({
            "name": chosen, "version": version, "labels": list(final.classes_), "confidence_threshold": threshold,
            "dataset_sha256": ds["sha256"], "scikit_learn": sklearn.__version__, "trained_at": datetime.now(UTC).isoformat(),
            "params": candidates[chosen]["params"],
        }, indent=1) + "\n")
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return report
