# Progress

## Phase 1: Foundation (complete)
See git history. Auth (bcrypt + JWT, DB-checked roles), audit log, health and integration-status endpoints, Docker Compose, CI, docs.

## Phase 2: Ticket management MVP (complete, with the verification gaps below)

**Done**
- Models and migration `0002`: `tickets` (unique `source` + `external_id`, so synthetic and external ids never mix; approved category and priority only) and `ticket_activities`.
- API: `GET/POST /api/tickets`, `GET/PATCH /api/tickets/{id}`, `POST /api/tickets/{id}/comments`, `GET /api/categories`, `GET /api/assignees`, `GET /api/analytics/overview`. Search (LIKE wildcards escaped), filters, whitelisted sort, pagination (max 100/page), validation, 404/422 errors, audit rows for create and update.
- Every field change writes a history entry; a no-op update writes none. Moving to resolved/closed sets `resolved_at`; reopening clears it.
- Dashboard figures are computed from the database. Average resolution time counts only resolved/closed tickets whose `resolved_at` exists and is not before `created_at` (tested).
- Synthetic data: 45 scenario families, ~390 tickets, reproducible generator, family-level train/validation/test split (`docs/methodology.md`). `seed_database.py` loads them with activity history, idempotently.
- Frontend: Dashboard (summary cards, trend and category charts, recent activity, priority counts, trend window), Tickets (debounced search, status/priority/category/unassigned filters, sort, pagination, URL filters from dashboard cards), New ticket, Ticket detail (description shown as plain text, status/priority/category/assignee editing, resolution summary, activity feed, notes).

**Verified in the build environment**
- `pytest`: 28 passed. `ruff`: clean. `tsc --noEmit`: clean. `next build`: succeeded.
- Alembic on SQLite: up, down, up, `alembic check` (no drift). Seed loads 389 tickets and is idempotent.
- Both servers run together; all pages return 200 and the create, update, search and filter workflow works over HTTP, with dashboard totals changing consistently.

**Not verified**
- No browser was available, so the UI has not been clicked through. Pages were only checked for HTTP 200, type safety and a successful build.
- Docker and PostgreSQL still unverified here; migrations `0001` and `0002` run on PostgreSQL only in CI.
- No frontend automated tests yet (Phase 8).

**Known limitations**
- Priority and category editing on the detail page has no confirmation or optimistic update; a failed save shows an error and leaves the previous value.
- Ticket list shows the approved category only; AI predictions arrive in Phase 3.
- The workspace was reset mid-phase and Phase 2 backend files were rewritten from scratch; the tests above were run on the rewritten code.

## Phase 3: ML classification (complete, with the verification gaps below)

**Done**
- Training and evaluation package `app/ai/classification` (text prep, metrics, training, runtime service); `scripts/train_classifier.py` trains, evaluates and saves artifact plus report. Deterministic.
- Models: majority-class floor, TF-IDF (word + character n-grams) + logistic regression (baseline, deployed by validation), TF-IDF + calibrated linear SVM.
- Two leakage-safe splits (template-level primary, family-level stress); generator now pairs each subject with its own description template and writes `template_id`, `split`, `split_novel` (see `docs/methodology.md`).
- Tables and migration `0003`: `ai_predictions`, `technician_feedback`. Predictions are stored apart from tickets.
- API: `POST /api/ai/classify` (ticket or free-text preview), `GET /api/ai/tickets/{id}/predictions`, `POST /api/ai/predictions/{id}/review`, `GET /api/evaluation/summary`.
- Low confidence is flagged for manual classification (threshold from validation); alternatives shown; accept, edit, reject with optional feedback; one review per suggestion; every step in the ticket history.
- UI: category suggestion panel on the ticket page; AI evaluation page (comparison with intervals, per-category table, confusion matrix, calibration, threshold behaviour, errors, limitations, live review statistics).

**Results (primary protocol, test n=97; synthetic data)**
- Deployed logistic regression: accuracy 0.639 (95% CI 0.55 to 0.73), macro-F1 0.599. SVM: accuracy 0.691, macro-F1 0.683. Paired difference interval includes 0, so no reliable difference. Majority floor: 0.134.
- Unseen problem types (stress): accuracy 0.44 to 0.46.
- At the 0.5 threshold, 36% of tickets get a confident suggestion (97% accurate); 64% are flagged for manual review. Calibration error 0.147.
- These are results on invented data. Real tickets would likely score lower.

**Verified in the build environment**
- `pytest`: 49 passed. `ruff`, `tsc`, `next build` clean. Migrations `0001` to `0003` up/down/up, no drift.
- Training report reproducible (identical except latency). Fresh DB seeded, both servers run, suggest, accept, 409 on repeat, ticket updated only after acceptance, evaluation summary correct, all pages 200.

**Not verified**
- No browser, so the new UI was not clicked through (type-checked and built only).
- Docker (including training at image build) and PostgreSQL still untested here; CI runs the migrations and training on PostgreSQL.
- No frontend automated tests yet (Phase 8).

**Known limitations**
- The sentence-embedding classifier (extra model required by the brief) is still outstanding: see Phase 4 (model could not be downloaded here).
- Classification is not yet used to pre-fill new tickets; the new-ticket form does not call it.
- Dataset was regenerated (383 tickets, `SYN-` ids now refer to different tickets than in Phase 2). Reset a demo database to match (see README).

## Phase 4: Knowledge base and retrieval (complete, with the gaps below)

**Done**
- Knowledge articles: table and migration `0004`; fields for title, category, problem, steps, escalation, tags, source type/note/link, status (draft / approved / archived), updater and timestamps.
- API: `GET/POST /api/knowledge`, `GET/PATCH /api/knowledge/{id}`, `GET /api/knowledge/search`. New articles are always drafts; only administrators approve or archive; a technician edit of an approved article returns it to draft. Text is stored and shown as plain text (HTML tags stripped). Changes are audit-logged.
- 32 original sample articles (`data/knowledge/articles.json`), each labelled as original sample content. No StFX policy or restricted content was copied. Loaded by `scripts/seed_database.py`.
- Retrieval (`app/ai/retrieval`): TF-IDF keyword baseline, a semantic scorer, and a simple hybrid. Similar incidents (`POST /api/ai/similar-incidents`) and related articles (`POST /api/ai/related-articles`) work from a stored ticket or free text, show similarity scores, category, status and a short resolution summary, and never act on retrieved text.
- Evaluation: `scripts/evaluate_retrieval.py` writes `data/evaluation/retrieval_report.json` (Precision@K, Recall@K, Hit@K, MRR with intervals, nDCG@5, latency, validation-chosen weak-match threshold).
- UI: Knowledge base list (filter or ranked search), article view/edit/approve, new-article form, related-articles and similar-incidents panels on the ticket page, retrieval section on the AI evaluation page.

**Embedding model (important)**
- The build environment cannot reach huggingface.co, so the pretrained `sentence-transformers` model was **never downloaded or run here**. The code path exists (`embedding_provider=auto` tries it, `sentence_transformers` requires it) but is **unverified**.
- All reported "semantic" numbers use a local latent-semantic-analysis (TF-IDF + SVD) embedder fitted on the indexed text. That is a weaker stand-in, not a sentence-embedding model. To use the real model: `pip install -e ".[embeddings]"`, then re-run `scripts/evaluate_retrieval.py --provider auto` with network access.
- The sentence-embedding **classifier** (second approach from the brief) is therefore still not done.
- pgvector is not used: the corpus is a few hundred documents, so an in-process exact index is simpler. The compose image still ships pgvector for a later switch.

**Results (synthetic data; embedder = lsa)**
- Similar incidents, 97 primary-split test tickets against 191 primary-split train tickets, relevant = same scenario with a different phrasing: Precision@1 0.34 (keyword) / 0.361 (semantic) / 0.351 (hybrid); MRR 0.454 / 0.462 / 0.458 with overlapping intervals, so no method is shown to be better. Top result is in the right category 66% / 63% / 64% of the time.
- Articles, 69 test tickets with a labelled article: Precision@1 0.971, Recall@5 1.0, MRR 0.986 for all three methods. This is very likely optimistic: the article labels and the articles were written by the same author who knew the ticket scenarios.
- Weak-match threshold (hybrid): answers 84% of tickets that have an article (100% correct) but still suggests an article for 4 of 28 tickets with no matching article. Short search phrases score lower than ticket-length text, so good matches can show as "weak".
- No incident-similarity threshold reached 80% precision on validation, so similar incidents show scores for ranking only.

**Verified in the build environment**
- `pytest` 78 passed. `ruff`, `tsc`, `next build` clean. Migrations `0001` to `0004` up/down/up, no drift. Retrieval report reproducible (test compares a fresh run with the committed file). Live API run on a seeded database: search, related articles, similar incidents, 403 for technician approval, draft creation with HTML stripped, evaluation summary.

**Not verified**
- Pretrained sentence-transformers path (no network to download the model).
- UI not clicked through in a browser; Docker and PostgreSQL not run here (CI runs migrations on PostgreSQL).
- Article relevance labels have not been reviewed by a human.
- No frontend automated tests yet (Phase 8).

## Phase 5: Troubleshooting assistant (complete, with the gaps below)

**Done**
- `app/ai/troubleshooting/assistant.py`: an *extractive* assistant. It generates no text. It takes the best approved articles for a ticket and shows their steps verbatim with the source, adds escalation guidance copied from the article, and lists how similar resolved tickets were closed (duplicates removed, at most three).
- Insufficient-evidence handling: if the best article scores below the validated threshold, the assistant says so, shows the closest articles **without steps**, and gives generic fact-gathering prompts. With no approved articles it says there is nothing to draw on. If no threshold was validated for the running embedder it still answers but labels the result unvalidated.
- API: `POST /api/ai/assist` (stored ticket, or free-text preview that is not saved), `GET /api/ai/tickets/{id}/assistant`, `POST /api/ai/assistant/{id}/feedback` (helpful / partly / not helpful, one rating each, 409 on repeat). Table and migration `0005` (`assistant_suggestions`). Suggestions are stored apart from the ticket and never change it; requests and ratings appear in the ticket history and audit log (ids only).
- UI: assistant panel on the ticket page (cited steps, status banner, past resolutions, rating, and a button that copies the steps into a ticket note on the technician's request); assistant section on the AI evaluation page.
- Evaluation: `scripts/evaluate_assistant.py` writes `data/evaluation/assistant_report.json`, reusing the Phase 4 articles, labels and validation-chosen threshold.
- No external AI service or LLM is used. `EXTERNAL_LLM_ENABLED` stays off and is not read by this code.

**Two bugs found and fixed while verifying**
- The retrieval index crashed on a very small corpus (for example one ticket and no articles); the LSA embedder now falls back to plain TF-IDF vectors in that case (test added).
- The runtime used one embedding fit over articles and tickets together, while the article threshold had been validated on an article-only fit, so clear matches were wrongly declined. The service now keeps separate article and ticket indexes, matching the evaluation setup.

**Results (synthetic test split, n=97; local LSA embedder)**
- Right call (correct cited steps when a matching article exists, or declined when none exists): 84.5% (95% interval 77.3% to 90.7%).
- Offered steps for 84.1% of tickets that have an article (100% of those correct); wrongly declined 11.
- Declined 24 of 28 tickets with no article; wrongly offered steps for 4.
- Past resolution from the same scenario: 54.6% (similarity only; no threshold validated, so these are shown as unvalidated).
- These measure picking and citing the right article. They do **not** show that following the steps fixes a ticket. Labels were written by the project author and are unreviewed; the data is synthetic, so real tickets would likely score lower.

**Verified in the build environment**
- `pytest` 92 passed; `ruff`, `tsc`, `next build` clean; migrations `0001` to `0005` up/down/up, no drift; assistant report reproducible (tested); live API run on a seeded database (grounded and declined cases, rating, 409 on repeat).

**Not verified**
- UI not clicked through in a browser. Docker and PostgreSQL not run here (CI covers migrations on PostgreSQL).
- Pretrained sentence-transformers model still never run (no access to huggingface.co); the sentence-embedding classifier remains outstanding.
- Whether technicians find the suggestions useful is untested (no real users); ratings are collected for that purpose.
- No wider-incident detection (several similar open tickets) yet; escalation guidance is only what the article says.

## Phase 6: Analytics and evaluation (complete, with the gaps below)

**Done**
- Analytics page (`/analytics`, API `GET /api/analytics/insights`): tickets per week by category, resolution time by priority and category (median and mean, with counts; only tickets with valid dates), unresolved tickets by age, recurring issues (identical subject lines seen 3+ times), possible incidents, live AI-usage counts (category reviews, assistant ratings), and a data-quality note when resolved tickets lack timestamps.
- Incident-burst rule (`app/services/incidents.py`): 5 or more tickets in one category within 3 hours, parameters fixed in advance. It only flags; a person decides.
- `scripts/evaluate_incidents.py` scores the rule against the generator's planted bursts (the detector never sees the planted labels) and on 20 other generator seeds, with a sensitivity table. Result: 2 of 2 planted bursts found, 0 false alarms; 40 of 40 found across the other seeds with 0 false alarms. The planted bursts are tight one-morning clusters, so this is an easy test and says little about real incidents.
- `scripts/build_results.py` builds `docs/results.md` and `data/evaluation/results_tables.csv` from the four saved reports (classification, retrieval, assistant, incidents). Nothing is typed by hand; `--check` fails if they are out of date, and a test runs it. The document includes an "AI helps / person still needed" table and a section listing what has not been measured.
- AI evaluation page now also shows the incident report and the assistant section.

**Decisions and limits**
- No time-saved or cost claim is made anywhere: it is not measured. `docs/results.md` says so explicitly.
- Priority recommendation (listed in the original brief as optional) is not built.
- Aggregation for the insights endpoint is done in Python, fine for thousands of tickets; move to SQL at larger scale.
- Recurring issues group on identical subject text, so near-duplicate wording is not merged.
- Analytics numbers depend on the data loaded. The seed script loads synthetic tickets dated around 2026-11-02, so "unresolved ticket age" reflects the current date, not the generation date.

**Verified in the build environment**
- Burst rule unit tests (boundaries, merging, categories, validation); insights API tests against known data (counts, burst, recurring, aging, missing timestamps, empty database); report-reproducibility tests; results-document freshness test. Live API run on the seeded database returned two incidents (network outage, Microsoft 365) and plausible resolution times. `tsc` and `next build` clean.

**Not verified**
- UI not clicked through in a browser; Docker and PostgreSQL not run here (the insights endpoint selects plain columns and aggregates in Python, so it should be portable, but it has not been run against PostgreSQL).
- Nothing real-world: all analytics describe synthetic data.
- Pretrained sentence-embedding model and the sentence-embedding classifier remain outstanding.

## Phase 7: TeamDynamix adapter (optional; built, mock-tested only)

**Done**
- Provider-independent interface and records (`app/integrations`), a TeamDynamix provider, a registry that creates nothing unless explicitly enabled and valid, and admin-only `test` and `import` endpoints (import is a dry run by default and writes only to XSupport). Status endpoint now reports state (`disabled`, `misconfigured`, `ready`, `degraded`, `paused`), request/failure counts and last error kind; Settings page shows it. No outbound request is made by the status endpoint.
- Read-only is enforced in the client (six allowed read operations; no write methods exist; `READ_ONLY=false` is refused). Bearer token handling, https-only, no redirects, pagination, sliding-window rate limit, retries with backoff and `Retry-After`, circuit breaker, field minimisation (people names off by default, private feed entries dropped, HTML stripped), audit logging.
- 43 mocked tests (httpx MockTransport; no network) plus application-level tests: default state, misconfiguration, write-mode refusal, connection test, 503 handling, dry-run vs real import, idempotence, failure writes nothing, import cap, role checks. The app was shown to work with no TeamDynamix settings at all.
- `docs/teamdynamix.md` documents safeguards, what is unverified, and how approved access could be configured.

**Important limits**
- **Never run against a real TeamDynamix server.** I did not contact any StFX endpoint, including the public OpenAPI specification, because the project rules say never to connect to live StFX endpoints without authorisation.
- **Field names, the paged-search body/response shape and rate limits are from general knowledge, not the StFX specification.** They must be checked against the published spec before any approved use (list in `docs/teamdynamix.md`). The mocked tests prove the adapter's logic against my assumptions, not against TeamDynamix.
- Write operations (create/patch ticket) are deliberately not implemented.

**Verified in the build environment**
- `pytest` 146 passed; `ruff` clean; no new migration.

**Not verified**
- Everything against a real server; UI not clicked through; Docker and PostgreSQL not run here.

## Next: Phase 8, final testing and documentation
Frontend tests, end-to-end checks, security review, final documentation and demo script, and a reproducibility check from a clean clone.

## Phase 8 – Final testing and docs (in progress)
- Backend tests: 147 passed (executed), ruff clean.
- Added docs/demo.md and docs/limitations.md.
- TeamDynamix authorization not granted; integration stays disabled.

## UI redesign – Phases 1-2 (design system and app shell)
- Done: tokens, themes, shared components, new shell (see docs/ui-audit.md).
- Executed: `tsc --noEmit` clean; `next build` passes; rendered real pages (seeded synthetic data) with Playwright at 375/768/1024/1440 (light) and 375/1440 (dark) for Dashboard and Tickets: no horizontal overflow, no console errors.
- Executed interaction checks (Playwright, 11 passed): palette opens with Ctrl+K and finds tickets, Enter navigates, Esc closes, theme switch persists across reload, sidebar collapse persists with tooltip, mobile drawer opens/closes, sign-out returns to login.
- Not done: no ESLint config exists yet; no automated frontend test suite committed (the checks above were ad hoc scripts); Lighthouse not run; page bodies (dashboard, tickets, etc.) still use their old layouts.

## UI redesign – Phase 3 (Dashboard) (complete)
- Dashboard (`frontend/src/app/(app)/dashboard/page.tsx`): header with trend window and New ticket; six KPI cards with icons and equal heights;
  created-vs-resolved area chart; status and priority distribution (counts printed, links to filtered lists); recent tickets
  (`GET /tickets?sort=created_at&desc=true&page_size=6`); AI review queue (counts from `/analytics/insights` → `ai_use.category_review`, amber AI styling);
  possible recurring incidents (burst rule + repeated subjects, labelled "look at this", not a confirmed incident); recent activity (latest 6);
  tickets by category as labelled HTML bars linking to the filtered list; API/database health. Skeleton, error-with-retry and empty states per panel.
- `StatCard` is `h-full flex-col` with a reserved hint row, and uses Next `Link`. Tickets page reads `?q=` and `?category_id=` from the URL.
- Panels go side by side from 1280 px (`xl`); at 1024 px the side column was too narrow and truncated legend labels, so it now stacks.
- Chart animation is off when the user prefers reduced motion.
- Only existing endpoints are used; no backend change. Limitation: the backend gives review-queue counts only, not a list of pending suggestions.

**Executed (2026-11-09)**
- `npm ci`, `npm run typecheck` (clean) and `npm run build` (succeeded) in `node:22-alpine`; the frontend image build runs `next build` again.
- `docker compose up -d --build` (PostgreSQL 16 + pgvector, backend, frontend): all three containers start, `alembic upgrade head` reaches `0005`
  on PostgreSQL, `/api/health` reports ok/connected, seed loads 383 synthetic tickets and 32 articles. First run of Docker/PostgreSQL in this environment.
- First committed frontend test: `frontend/e2e/dashboard.spec.ts` (Playwright 1.64.1, run in `mcr.microsoft.com/playwright:v1.64.1-noble` against
  the compose stack). It logs in, renders the dashboard at 375/768/1024/1440 in light and dark, and asserts real data loaded, KPI cards in a row
  have equal height (within 1 px), no horizontal overflow, no console errors. **8 passed.** Screenshots were inspected by eye at all four widths.
- Run: `scripts/e2e.sh` (added in UI Phase 4; isolated stack).

**Not done**
- No ESLint config. AI panels and knowledge workflows still need e2e tests (Phases 5-7).
- The AI review queue was only seen in its empty state (seeded data has no stored suggestions); the populated state is not rendered yet.
- Lighthouse and screen-reader checks not run.

## UI redesign – Phase 4 (Tickets list and details) (complete)
**List** (`tickets/page.tsx`): page header; filter bar with search (icon), status, priority, category, assignee (anyone / unassigned / person)
and sort; removable filter chips and Clear; all filters, sort and page kept in the URL (bookmark, share, Back). Sortable column headers
(`aria-sort`), whole-row click target with one tab stop, assignee initials, relative times with the full date on hover, "Showing x–y of n",
skeleton, empty-with-clear and error-with-retry states. Cards below 1024 px, table from 1024 px; assignee column from 1280 px.
**Detail** (`tickets/[id]/page.tsx`): ticket number, source, badges and times in the header; "Ticket details" card holding the
technician-approved fields, with per-field saving indicator and success/error toasts; resolving or closing without a resolution summary
asks for confirmation; description; resolution summary with Discard; activity timeline with kind icons (AI events in amber) and a note
composer (Ctrl/Cmd+Enter). All AI panels moved to a separate, labelled "AI assistance" column with a note that confidence is an estimate,
not a guarantee; on narrow screens a header link jumps to it. Loading skeleton; 404 shows "Ticket not found".
**New ticket**: page header, back link, form in a card. Breadcrumb shows ticket numbers as XS-00042.

**Bugs found and fixed**
- Backend: priority and status sorted by stored value. On PostgreSQL "priority, descending" put *low* first (enum order); SQLite sorts the
  text alphabetically. Now an explicit rank (most urgent first; status in workflow order). Test added.
- Backend: search did not match the displayed ticket number (XS-00042 is derived from the id; search only checked `external_id`), in the list
  and the Ctrl+K palette. Now accepts XS-00042, XS42 or digits, alongside text matches. Test added.
- Frontend: a note and a field change saved at the same moment could leave the screen showing the older state (each response is a full
  snapshot; the slower one won). The ticket is now refetched after every save. Regression test added.
- Frontend: 404s were retried three times with backoff (~7 s of skeleton). Client errors (4xx) are no longer retried.
- At 768 px with the sidebar open the table's fixed columns left no width for Subject (it vanished); found by the render test.

**Executed (2026-11-10)**
- Backend `pytest`: **149 passed** (147 + 2 new); `ruff` clean (in `python:3.12-slim`).
- `npm run typecheck` clean; `npm run build` succeeded.
- `scripts/e2e.sh` (new): throwaway Compose project `xsupport-e2e` on ports 3001/8001 with its own volume, seeded, removed afterwards.
  **20 passed**: dashboard (8), tickets list + detail rendering at 375/768/1024/1440 in light and dark (8; no overflow, no console errors),
  search/filter/sort/URL workflow, create → assign → note → resolve-with-confirmation, concurrent note + field change, ticket not found.
  Workflow tests also passed 3 times in a row (`--repeat-each=3`, 12/12). Screenshots inspected by eye.
- Earlier runs against the demo stack had created 13 "E2E … ticket" rows in the demo database; they were deleted (cascade), leaving the
  383 seeded tickets. The isolated runner prevents this from now on.

**Not done**
- AI panels themselves are not restyled (Phase 5); they keep their old internals inside the new column.
- No bulk actions, saved views or keyboard row navigation. No ESLint config. Lighthouse and screen-reader checks not run.
