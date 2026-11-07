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

## Added in Phase 3
- **Model files are pickles.** `joblib.load` can execute code, so the service only loads `backend/model_artifacts/`, which is produced by our own training script, is git-ignored, and is rebuilt in the Docker image. Never load a model file from an untrusted source.
- The artifact records its scikit-learn version; a mismatch is refused with a "retrain" message instead of loading.
- Ticket text is only vectorised by the classifier; it is never executed, templated into a prompt, or used to choose an action. A test sends an injection-style ticket and asserts nothing else changes.
- `POST /api/ai/classify` never alters the ticket. Only an explicit accept or edit by a signed-in technician changes the approved category, and each review is one-shot (409 on repeat).
- Audit rows for classification and review hold ids and decisions only, never ticket text.

## Added in Phase 4
- Articles and ticket text are untrusted: stored/rendered as plain text (HTML tags stripped, React escapes output), only vectorised for retrieval, never used to choose an action. A test covers an injection-style ticket.
- Technicians create drafts; only administrators approve or archive; editing an approved article as a technician returns it to draft. Drafts and archived articles are never returned by retrieval.
- Article `source_url` must be http(s); links open with `rel="noopener noreferrer nofollow"`.
- Embedding models run locally; no ticket or article text is sent to an external service. A model download (optional) happens only if the `embeddings` extra is installed and a provider other than `lsa` is configured.
- The retrieval index is held in process memory (contains ticket text); it is rebuilt from the database and not persisted.

## Added in Phase 5
- The assistant is extractive: no text is generated, no external AI service is called, and ticket text is used only as a retrieval query. Steps come from approved articles only (drafts and archived articles never appear); a test covers an injection-style ticket.
- Suggestions never modify tickets. Copying steps into a ticket note is a separate technician action using the normal comment endpoint.
- Rating comments are stored as plain text (tags stripped). Audit records hold ids and status only.

## Added in Phase 6
- Analytics endpoints require sign-in and return aggregates plus ticket ids and subject lines (the same data a technician can already see). No export endpoint was added, which avoids spreadsheet formula-injection issues.
- Incident flags are advisory and trigger no automatic action.

## Added in Phase 7
- The TeamDynamix adapter is off by default, read-only by construction (fixed allowlist of read requests, no write methods), https-only, never follows redirects, and keeps the token out of logs, status output and errors. See `docs/teamdynamix.md`.
- Import and connection-test endpoints are administrator-only and audited (counts only). Import is a dry run unless explicitly requested and never overwrites local tickets.
- httpx's own request logging is lowered to WARNING because it prints full URLs (ticket ids); the adapter logs a masked line instead.
- Imported ticket text is handled by local models only; the external-LLM flag stays off.
