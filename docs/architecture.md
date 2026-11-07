# Architecture

## Components
Next.js frontend → FastAPI API → services/repositories → PostgreSQL. The frontend never talks to TeamDynamix; all integration logic lives in the backend behind a provider-independent data adapter (synthetic data by default, TeamDynamix only when authorized). AI predictions are stored separately from original ticket data.

Backend layers: `api/routes` (thin handlers) → `services` (business logic) → `repositories` (data access, from Phase 2) → `models`. `ai/{classification,priority,retrieval,troubleshooting}` and `integrations/` are reserved for later phases.

## Roadmap and dependencies
| Phase | Delivers | Depends on |
|---|---|---|
| 1 Foundation | Auth, DB, migrations, shell, Docker, CI | none |
| 2 Tickets | Ticket models/CRUD, synthetic data, dashboard | 1 |
| 3 Classification | TF-IDF + LR, second model, evaluation, review UI | 2 (labelled data) |
| 4 Retrieval + KB | Knowledge base, embeddings, similar incidents | 2 |
| 5 Assistant | Grounded troubleshooting, escalation, feedback | 3, 4 |
| 6 Analytics/Eval | Dashboards, recurring-incident detection, reports | 3, 4, 5 |
| 7 TeamDynamix | Optional read-only adapter with mocked tests | 2 (adapter interface) |
| 8 Final | Test hardening, docs, demo | all |

## MVP scope
Standalone, synthetic-data application: tickets, classification, rule-based priority with reasons, similar-incident and knowledge retrieval, retrieval-grounded assistant without a paid LLM, human review of every AI output, analytics and evaluation. TeamDynamix is out of the MVP.

## Database design
Implemented in Phase 1: `users`, `categories`, `audit_logs`.

Planned (migration per phase), with the key design rules:
- `tickets` carries an `source` (synthetic / teamdynamix) and `external_id`, unique together, so synthetic and external identifiers never mix. Original fields only.
- `ticket_activities` for history.
- `ai_predictions` (classification, priority) and `ai_suggestions` reference a ticket but never modify it; each stores model name, version, confidence and rationale.
- `technician_feedback` records accept / reject / edit with reason, user and timestamp.
- `knowledge_articles` with status (draft/approved) and source info; embeddings added with pgvector in Phase 4.
- `model_evaluations`, `incident_groups` (with a verified/unverified flag), `integration_sync_state`.
- The approved ticket priority and category are separate columns from the AI recommendation.

## Retrieval (Phase 4)
`app/ai/retrieval` holds embedders (local LSA, optional sentence-transformers), an in-process exact cosine index with lexical / semantic / hybrid scoring, and ranking metrics. `app/services/retrieval.py` builds the index from approved articles and all tickets and rebuilds it when their counts or latest update times change. It runs inside the API process, so memory grows with the corpus; pgvector is the documented scale-up path. Table `knowledge_articles` (migration `0004`) stores articles; AI outputs from retrieval are not stored, so nothing here can alter ticket data.

## Troubleshooting assistant (Phase 5)
`app/ai/troubleshooting/assistant.py` is a pure decision function over retrieved evidence; `app/services/assistant.py` gathers evidence (article and ticket indexes in `services/retrieval.py`), loads the full approved articles for their steps, stores the result in `assistant_suggestions` (migration `0005`) and records ratings. Article and ticket retrieval use separate indexes so the article threshold matches the setting it was validated in.

## Analytics (Phase 6)
`app/services/analytics.py` computes dashboard and insight figures from the database on each request. `app/services/incidents.py` is a pure function (category, time) over tickets. Evaluation outputs are JSON reports in `data/evaluation/`, merged into `docs/results.md` by `scripts/build_results.py`.
