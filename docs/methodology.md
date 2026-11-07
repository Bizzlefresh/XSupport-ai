# Methodology

All data is synthetic. Nothing here establishes real-world accuracy.

## Dataset
`scripts/generate_tickets.py` (seed 42, fixed anchor date) writes `data/synthetic/tickets.json`. The output is byte-identical for the same seed and anchor (tested, and checked in CI).

- 45 scenario *families* across the 8 categories. A family is one underlying problem. Each family has exactly **two phrasing templates**; a template pairs one subject wording with one description wording. Slot values (building, device, application), greetings, typos, case changes and terse one-liners add variation within a template.
- 383 tickets, 90 templates. Four deliberately ambiguous families (for example a Wi-Fi login failure that could read as Account, or a phishing click that arrives as an email complaint).
- Statuses depend on ticket age; resolution times are log-normal by priority. Two incident bursts (a building network outage and a Microsoft 365 sign-in failure) put many similar tickets on one day. About 2% of resolved tickets deliberately lack a resolution timestamp.

## Two leakage-safe splits
Both splits are written on every ticket and verified by tests.

| Split | Field | Unit held out | Question it answers |
|---|---|---|---|
| **Primary** | `split` | phrasing template | Can the model classify new wordings of problem types it has seen? This is how a helpdesk mostly works. |
| **Stress** | `split_novel` | whole scenario family | Can it classify problem types it has never seen? A deliberately harsh test. |

Primary split: every family's first template is training data. Its second template is evaluation data, alternating validation and test across the category's families, so validation and test never share a template **or** a problem type. A template is never in two splits, so near-duplicate tickets cannot leak. Result: 191 train, 95 validation, 97 test.

Stress split: per category one whole family goes to test, one to validation, the rest to training (242 / 78 / 63).

The primary split was introduced after the first training run showed that the family-only split scored about 47% accuracy. That result was real but answers the harder question, so it is reported (as "unseen problem types") next to the primary result, not hidden.

## Model selection protocol
1. Hyperparameters (C) and the deployed model are chosen on **primary validation macro-F1 only**. Ties go to the logistic-regression baseline.
2. The test sets are scored **once**, after selection. Nothing is tuned on them.
3. The stress split reuses the hyperparameters from step 1 and is not re-tuned.
4. The deployed artifact is the exact train-only model that was evaluated (it is not refit on validation data).
5. One feature decision was made on validation only: adding character n-grams (word-only logistic regression 0.67 -> 0.76 validation macro-F1).
6. The confidence threshold is the lowest value on validation at which accepted predictions are at least 90% precise (minimum 10 tickets).

## Models compared
Majority class (a floor), TF-IDF + logistic regression (baseline, `class_weight=balanced`), TF-IDF + linear SVM with sigmoid probability calibration. A sentence-embedding classifier is deferred to Phase 4 together with the embedding infrastructure.

## Uncertainty
Test sets are small (97 tickets), so the report includes 95% bootstrap intervals (1000 resamples, seeded) for accuracy and macro-F1, a paired bootstrap for the difference between the two real models, and expected calibration error. Report and artifact are regenerated with `python ../scripts/train_classifier.py`; the report is identical across runs except the machine-dependent latency block (tested manually).

## Limits
- One author wrote all scenarios, and there are only 90 templates, so test tickets share wording habits with training tickets. Accuracy on real tickets would likely be lower.
- Per-category test counts are small (9 to 17 tickets).
- SVM calibration uses ordinary stratified folds inside the training data.
- No real StFX tickets were used or are implied.
