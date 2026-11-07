"""Train, evaluate and save the ticket classifier. Reproducible: same data -> same report
(apart from the machine-dependent latency block).

    cd backend && python ../scripts/train_classifier.py
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.ai.classification.training import train_and_evaluate  # noqa: E402

DATASET = ROOT / "data" / "synthetic" / "tickets.json"
ARTIFACTS = ROOT / "backend" / "model_artifacts" / "category"
REPORT = ROOT / "data" / "evaluation" / "classification_report.json"


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    r = train_and_evaluate(DATASET, ARTIFACTS, REPORT)
    print(f"Deployed: {r['deployed']['name']} {r['deployed']['version']} threshold={r['deployed']['confidence_threshold']}")
    print(f"{'model':<20}{'val F1':>8}{'test acc':>10}{'test F1':>9}{'stress acc':>12}{'stress F1':>10}")
    for name, m in r["models"].items():
        st = m["stress_novel_problem_types_test"]
        print(f"{name:<20}{m['validation']['macro_f1']:>8.3f}{m['test']['accuracy']:>10.3f}{m['test']['macro_f1']:>9.3f}"
              f"{st['accuracy']:>12.3f}{st['macro_f1']:>10.3f}")
    print(f"Report: {REPORT}\nArtifact: {ARTIFACTS}")


if __name__ == "__main__":
    main()
