# Security notes

## Implemented (Phase 1)
- Password hashing with bcrypt (salted; inputs truncated at bcrypt's 72-byte limit).
- Signed, expiring JWT access tokens. The user and role are re-loaded from the database on every request, so deactivating a user or changing a role takes effect immediately.
- Server-side role checks through `require_roles`. The frontend hides admin UI but is not relied upon.
- Login failures return one generic message for unknown email, wrong password and inactive account, with a dummy hash check to reduce timing differences.
- Audit log rows for login and failed login. No credentials or submitted emails are stored in them.
- Secrets come from environment variables; `.env` is git-ignored; production refuses the default secret key.
- CORS is restricted to configured origins and methods.
- External integrations (TeamDynamix, external LLM) are off by default; the status endpoint reports configuration only, makes no outbound calls and never returns tokens.

## Known gaps and planned hardening
- Move the token from `sessionStorage` to an httpOnly, SameSite cookie (with CSRF protection) before real deployment.
- Add login rate limiting and lockout.
- Prompt-injection controls for ticket text and retrieved content (Phase 5): treat as untrusted, never let it trigger actions.
- Never send real institutional ticket content to external AI services without explicit approval.
- Never write to TeamDynamix based solely on AI output; adapter stays read-only by default (Phase 7).
