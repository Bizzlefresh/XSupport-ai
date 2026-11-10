# XSupport AI

AI-assisted IT helpdesk and incident management platform. Master of Applied Computer Science (MACS) project, St. Francis Xavier University.

**Data and access boundaries.** XSupport AI runs entirely on *synthetic* data and does not connect to TeamDynamix or any StFX system. The TeamDynamix adapter (Phase 7) is optional, disabled by default, and must not be enabled without written StFX authorization. Nothing in this repository represents real StFX incidents.

**Status:** Phase 7 (optional TeamDynamix adapter, mock-tested only) complete. Thesis-ready results: docs/results.md. See [docs/progress.md](docs/progress.md).

## Quick start (Docker)

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and SECRET_KEY
#   python -c "import secrets; print(secrets.token_urlsafe(48))"
docker compose up --build
docker compose exec backend python ../scripts/seed_database.py   # prints demo passwords if not set in .env
```

- App: http://localhost:3000 (sign in with `admin@xsupport.example.com` or `tech@xsupport.example.com`)
- API docs: http://localhost:8000/docs

## Local development (without Docker)

Backend (Python 3.11+; SQLite is fine for a first look, PostgreSQL for real use):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
export DATABASE_URL=sqlite:///./dev.db        # or a postgresql+psycopg:// URL
alembic upgrade head
python ../scripts/generate_tickets.py   # optional: regenerate (committed copy already present)
python ../scripts/seed_database.py       # loads ~390 synthetic tickets
uvicorn app.main:app --reload
```

Frontend (Node 20+):

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## Classifier

```bash
cd backend && python ../scripts/train_classifier.py   # trains, evaluates, writes model_artifacts/ and data/evaluation/classification_report.json
```
Docker builds do this automatically. Results and caveats: `docs/methodology.md`, and the AI evaluation page in the app.

## Resetting demo data

The synthetic dataset changed in Phase 3. To match it exactly (this deletes tickets you created):
`docker compose down -v && docker compose up --build`, then run the seed command again.

## Checks

```bash
cd backend && ruff check . && pytest -q
cd frontend && npm run typecheck && npm run build
```

End-to-end tests (Playwright, `frontend/e2e`) run against a throwaway Docker stack on ports 3001/8001 with its own
database, seeded and deleted afterwards, so the demo data is never changed. Needs Docker and `SEED_TECH_PASSWORD` in `.env`:

```bash
scripts/e2e.sh                 # all tests; screenshots land in frontend/e2e-artifacts/
scripts/e2e.sh -g workflows    # extra arguments go to `playwright test`
```

CI (`.github/workflows/ci.yml`) also runs migrations up/down/up against PostgreSQL.

## Layout

`backend/` FastAPI service · `frontend/` Next.js app · `scripts/` seeding (later: data generation, training, evaluation) · `data/` synthetic data, knowledge articles, evaluation sets · `docs/` architecture, security, progress.
