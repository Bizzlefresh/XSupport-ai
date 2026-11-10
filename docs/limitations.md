# Limitations and honest status

## Not verified
- UI was built and type-checked but not clicked through in a browser by the author.
- Backend tests use SQLite. Docker Compose with PostgreSQL was run once (2026-11-09): migrations, seed and the dashboard work; the backend test suite has not been run against PostgreSQL locally.
- Optional sentence-transformers embeddings and a sentence-embedding classifier were never run.
- Frontend e2e tests (Playwright, `scripts/e2e.sh`) cover the dashboard and ticket workflows; AI panels, knowledge, analytics and evaluation pages are not covered yet.

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
