# Evaluation

Offline classifier results are generated into `data/evaluation/classification_report.json` by `scripts/train_classifier.py` and shown on the **AI evaluation** page. Live technician-review statistics are computed from stored feedback.

## RQ1 (category classification): what is measured
Accuracy, macro precision, macro recall, macro F1, per-category precision/recall/F1/support, confusion matrix, expected calibration error with a confidence-bin table, coverage and precision at the manual-review threshold, 95% bootstrap intervals, a paired model comparison, error analysis, and prediction latency. Two protocols: primary (new wording of known problems) and stress (unseen problem types). See `methodology.md`.

## Human review (RQ4 groundwork)
Each suggestion stores model name and version, confidence, alternatives, the technician's decision (accepted, edited, rejected), the final category, optional feedback, user and timestamp. Rates shown on the evaluation page are computed over reviewed suggestions only. Feedback is never used to retrain automatically.

## RQ2 (retrieval): what is measured
`scripts/evaluate_retrieval.py` compares keyword TF-IDF, semantic and hybrid ranking. Incident queries are primary-split test tickets; the corpus is train tickets only; a hit is a ticket from the same scenario family written with a different phrasing template. Article queries are test tickets whose family has a labelled article. Models are fitted on the corpus only. The weak-match threshold is chosen on validation and applied once to test. Metrics: Precision@K, Recall@K, Hit@K, MRR with bootstrap 95% intervals, nDCG@5, median latency. The report lists its caveats; read them before quoting numbers. Semantic results are from local LSA unless the report says `sentence-transformers`.

## RQ3 (troubleshooting assistant): what is measured
`scripts/evaluate_assistant.py` applies the assistant's own decision rule (validated article threshold, article-only index) to the test split. The "right call" rate counts correct cited steps when a labelled article exists and a refusal when none exists. It does not measure whether steps resolve tickets; that needs technicians, and live ratings are collected for it. Run `evaluate_retrieval.py` first because the threshold comes from its report.

## Incident detection and the results document
`scripts/evaluate_incidents.py` checks the burst rule against planted bursts and 20 other seeds. `scripts/build_results.py` assembles every report into `docs/results.md` and a CSV; `--check` guards against stale output. All parameters are fixed before evaluation, and the sensitivity table is reported as information, not used to tune.

## Not yet measured
Retrieval metrics (RQ2), assistant groundedness (RQ3), end-to-end task performance, and any real-world efficiency claim. These need Phases 4 to 6 and a proper user study.
