# Progress

## Phase 1: Foundation (complete, with the verification gaps listed below)

**Done**
- Monorepo structure per the master instructions; empty AI/integration packages reserved for later phases.
- Backend: FastAPI app factory, environment-based settings, SQLAlchemy 2 models (`users`, `categories`, `audit_logs`), Alembic migration `0001`.
- Auth: bcrypt password hashing, signed JWT access tokens, `get_current_user` and `require_roles` dependencies. Roles are read from the database, not trusted from the token.
- Audit trail: logins and failed logins are written to `audit_logs`. Failed attempts do not store the submitted email.
- Endpoints: `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/me`, `GET /api/users` (admin only), `GET /api/integrations/status`. All execute real logic.
- Integrations are disabled by default; the production config refuses the default `SECRET_KEY`.
- Frontend: Next.js 15 + TypeScript + Tailwind + TanStack Query. Login, sidebar shell, Dashboard (live system status only), Settings (live integration status, admin user list). Unbuilt pages appear disabled and labelled with their phase.
- Docker Compose (pgvector/PostgreSQL 16, backend, frontend), `.env.example`, GitHub Actions CI.

**Verified in the build environment**
- `pytest`: 13 passed (health, login success/failure, audit rows, expired and forged tokens, role enforcement, integration status, docs exposure, password hashing, production secret guard).
- `ruff check`: clean. `tsc --noEmit`: clean. `next build`: succeeded.
- Alembic on SQLite: upgrade, downgrade, upgrade, and `alembic check` (no drift). Seed script is idempotent.
- Live uvicorn run: login, `/me`, 403 for technician and 200 for admin on `/api/users`, CORS preflight.

**Not verified (no Docker, PostgreSQL or browser in the build environment)**
- `docker compose up` and both Dockerfiles have not been built or run.
- Migrations have not been run against PostgreSQL locally. The CI job does this; confirm it passes on first push.
- The login flow has not been exercised in a real browser. The frontend and API were only checked separately.
- No frontend automated tests yet (planned for Phase 8).

**Decisions**
- bcrypt used directly instead of passlib (passlib is unmaintained and breaks on recent bcrypt).
- Tokens live in `sessionStorage` for now; move to an httpOnly cookie before any real deployment (see security.md).
- Hand-written shadcn-style `Button` and `Input`; the shadcn CLI will be initialised when more components are needed.
- System font stack (no web fonts) so builds work offline.
- Seed users use `@xsupport.example.com` because the email validator rejects `.local` domains.

**Known limitations**
- No login rate limiting or account lockout yet.
- No password-change or user-management endpoints yet.

## Next: Phase 2, Ticket Management MVP
Ticket, activity and related models and migration; ticket CRUD with activity logging; reproducible synthetic ticket generator (fixed seed, 300-500 tickets, train/validation/test split by template family); seeding; Tickets list and detail pages; dashboard metrics computed from the database.
