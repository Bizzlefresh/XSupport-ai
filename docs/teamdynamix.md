> **Status: authorization was not granted. The integration was never connected and remains disabled.**
> Everything below describes an optional design tested only with mocks.

# TeamDynamix adapter (optional, disabled by default)

**Status: built and tested against mocked HTTP only. It has never contacted a real TeamDynamix server, and it must not be
pointed at one without written authorisation from StFX IT Services.** XSupport AI is complete and fully functional without it.

## What it does
- A provider-independent interface (`app/integrations/base.py`) that XSupport could use for any ticket source. The TeamDynamix
  implementation (`app/integrations/teamdynamix.py`) reads tickets (single, paged search, feed), ticket statuses, and knowledge
  articles, and maps them to small records (`app/integrations/models.py`).
- Admin-only endpoints: `POST /api/integrations/teamdynamix/test` (one read of the status list) and
  `POST /api/integrations/teamdynamix/import` (**dry run by default**; with `dry_run=false` it copies tickets into XSupport as
  `source = teamdynamix`, skipping ones already imported and never overwriting local data).
- `GET /api/integrations/status` shows configuration and health. It makes no outbound request and never returns the token.
- The browser never talks to TeamDynamix; only the backend does.

## Safeguards (all covered by tests)
| Requirement | How it is met |
|---|---|
| Disabled by default | `TEAMDYNAMIX_ENABLED=false`; nothing is created or called otherwise |
| Read-only | The client allows only six read operations (fixed method + path patterns); anything else raises before any request. There are no write methods. `TEAMDYNAMIX_READ_ONLY=false` is refused as a misconfiguration because write support is intentionally not implemented |
| No changes from AI output | Nothing in XSupport writes to TeamDynamix, so AI output cannot change it |
| Secure token handling | Token comes only from the environment, is excluded from `repr`, logs, status output and error messages; sent only as a bearer header; redirects are never followed so it cannot reach another host |
| HTTPS only | Base URL must be `https` with no embedded credentials |
| Configurable application ID | `TEAMDYNAMIX_APP_ID` (numeric), used in every path |
| Pagination | Walks pages until a short page, a caller limit, or a hard 200-page stop |
| Rate limiting | Sliding window (default 60 calls per 60 s) |
| Retries and backoff | Retries timeouts, network errors, 429/502/503/504 with exponential backoff and jitter; honours `Retry-After` (capped at 60 s); never retries 401/403/400 |
| Controlled failure | Errors are generic (no response bodies); after 5 consecutive failures requests pause for 60 s; the API returns 409/502/503 and the rest of the app keeps working |
| Restricted field access | Only mapped fields are kept; requestor/assignee names are dropped unless `TEAMDYNAMIX_INCLUDE_PEOPLE=true`; private feed entries are never read; HTML is stripped |
| Audit logging | Test and import actions are written to the audit log (counts only, no ticket text); every request is logged with ids masked and no headers |

## What was confirmed from TeamDynamix's public documentation (vendor docs, not the StFX spec)
Read from the vendor's public Web API overview (solutions.teamdynamix.com): exceeding a rate limit returns HTTP 429; limits differ per method and are stated on each method's page (so the default 60/60 s is still an assumption); all dates are ISO 8601 in UTC; bearer tokens expire 24 hours after issue (a 401 can mean an expired token). The adapter already handles 429 and UTC dates; its 401 message now mentions expiry. Ticket field names and the paged-search shape could NOT be confirmed this way (the pages are script-rendered) and the StFX specification itself was not reachable from the build environment.

## What is NOT verified (must be checked before any approved use)
1. **Field names and response shapes were not checked against the StFX OpenAPI specification.** The endpoint paths come from the project brief. Ticket fields (`ID`, `Title`, `Description`, `StatusName`, `PriorityName`, `ServiceName`/`TypeName`, `CreatedDate`, `ModifiedDate`, `CompletedDate`, `RequestorName`, `ResponsibleFullName`), the paged-search request body (`PageIndex`, `PageSize`) and response container, the feed and knowledge-base fields, and rate-limit headers are written from general knowledge of the TeamDynamix Web API. Compare each with the published specification and adjust `map_*` and `iter_tickets`.
2. The default rate limit (60/60 s) and retry behaviour are assumptions; confirm the limits that apply to the account.
3. Status and priority mapping uses keyword matching on names (for example "Completed" becomes resolved). StFX's actual status and priority names need a reviewed mapping.
4. Categories are matched to XSupport categories by exact name; unmatched tickets import without a category.
5. A real token's permissions are unknown. An ordinary university account may be unable to read tickets; the adapter reports 401/403 as a clean error and does not try to work around it.

## Connecting for real: do it on your own machine
Run the backend where the token lives (your laptop or an approved server), not in a cloud AI session. Real ticket text would otherwise pass through an external AI service, which the project rules forbid without separate approval. Obtain the 24-hour token as StFX directs, put it in `.env` (never commit it), and refresh it when it expires.

## How approved access could be configured
1. Obtain written authorisation and a service credential with the narrowest read-only permissions from StFX IT Services.
2. Review the points above against the current specification, and update the mapping and tests.
3. Set in the deployment's secret store or `.env` (never in git): `TEAMDYNAMIX_ENABLED=true`, `TEAMDYNAMIX_BASE_URL`, `TEAMDYNAMIX_APP_ID`, `TEAMDYNAMIX_TOKEN`; leave `TEAMDYNAMIX_READ_ONLY=true`.
4. Check the Settings page shows state `ready`, then as an administrator run the connection test, then an import **dry run**, and only then a limited real import.
5. Imported ticket text is processed only by XSupport's local models. `EXTERNAL_LLM_ENABLED` must stay `false`; sending real ticket text to an external AI service needs separate approval and privacy review.
6. Confirm privacy obligations for storing a copy of real tickets (retention, access, deletion) before importing.
