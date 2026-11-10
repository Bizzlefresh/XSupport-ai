# Limitations and honest status

## Not verified
- The UI is exercised by automated Playwright tests (rendering, workflows, axe scans) but has not been tested with a screen
  reader or by real technicians. Automated accessibility checks find only part of real accessibility problems.
- Backend unit tests always use in-memory SQLite, also in CI. PostgreSQL is exercised by CI (migrations up/down/up, seed) and by the Docker Compose stack that every e2e run builds and seeds (run many times since 2026-11-09), not by the unit tests.
- Optional sentence-transformers embeddings and a sentence-embedding classifier were never run.
- Frontend e2e tests (Playwright, `scripts/e2e.sh`) cover every page; they run on a throwaway stack with synthetic data.

## TeamDynamix
- Authorization for StFX TeamDynamix was **not granted** (security reasons). No connection was made.
- The adapter is tested only against mocked responses. Field names, paged-search request shape
  and rate limits are unverified against the real StFX schemas.
- It must stay disabled unless IT Services approves access in writing.

## Results
- All accuracy figures come from synthetic data and do not establish real-world performance.
- Incident similarity has no validated threshold. Article relevance labels have not had human review.

## Security gaps for a real deployment
- JWT stored in browser storage (move to httpOnly cookie); no login rate limiting.
