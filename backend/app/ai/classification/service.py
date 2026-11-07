"""Runtime category prediction from the saved artifact. No external AI calls; runs fully locally."""
import json
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import sklearn

from app.ai.classification.text import build_text

DEFAULT_DIR = Path(__file__).resolve().parents[3] / "model_artifacts" / "category"
MAX_ALTERNATIVES = 3
MIN_ALTERNATIVE_PROB = 0.05


class ClassifierUnavailable(RuntimeError):
    """Raised when no usable model artifact exists. The message is safe to show to users."""


@dataclass(frozen=True)
class Prediction:
    label: str
    confidence: float
    alternatives: list[dict]  # [{"label", "probability"}] excluding the top label
    needs_manual_review: bool
    threshold: float
    model_name: str
    model_version: str
    latency_ms: float


class CategoryClassifier:
    def __init__(self, directory: Path):
        meta_path, model_path = directory / "metadata.json", directory / "model.joblib"
        if not (meta_path.exists() and model_path.exists()):
            raise ClassifierUnavailable("The category classifier has not been trained. Run scripts/train_classifier.py.")
        self.meta = json.loads(meta_path.read_text())
        if self.meta["scikit_learn"].split(".")[:2] != sklearn.__version__.split(".")[:2]:
            raise ClassifierUnavailable(
                f"Model was trained with scikit-learn {self.meta['scikit_learn']} but {sklearn.__version__} is installed. "
                "Retrain with scripts/train_classifier.py.")
        # joblib is pickle-based: only ever load artifacts produced by our own training script (docs/security.md).
        self.model = joblib.load(model_path)

    def predict(self, subject: str, description: str) -> Prediction:
        t0 = time.perf_counter()
        proba = self.model.predict_proba([build_text(subject, description)])[0]
        classes = list(self.model.classes_)
        order = np.argsort(proba)[::-1]
        top = int(order[0])
        confidence = float(proba[top])
        alts = [{"label": classes[i], "probability": round(float(proba[i]), 4)}
                for i in order[1:1 + MAX_ALTERNATIVES] if proba[i] >= MIN_ALTERNATIVE_PROB]
        threshold = float(self.meta["confidence_threshold"])
        return Prediction(
            label=classes[top], confidence=round(confidence, 4), alternatives=alts,
            needs_manual_review=confidence < threshold, threshold=threshold,
            model_name=self.meta["name"], model_version=self.meta["version"],
            latency_ms=round((time.perf_counter() - t0) * 1000, 2))


_lock = threading.Lock()
_instance: CategoryClassifier | None = None
_dir: Path = DEFAULT_DIR


def get_classifier() -> CategoryClassifier:
    global _instance
    with _lock:
        if _instance is None:
            _instance = CategoryClassifier(_dir)
        return _instance


def configure(directory: Path | None) -> None:
    """Point the service at another artifact directory (used by tests) and drop the cached model."""
    global _instance, _dir
    with _lock:
        _dir, _instance = directory or DEFAULT_DIR, None
