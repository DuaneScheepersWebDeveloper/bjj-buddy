# Error logging

Every error ends up as a row in the `error_log` table in Postgres. The table
is created automatically the next time the API starts.

## What gets logged automatically

| What | Level | Notes |
|---|---|---|
| Unhandled exception in any endpoint | ERROR | Full stack trace, request body (passwords/tokens redacted), user. Client gets `{"detail": "Internal server error", "request_id": "..."}` |
| `HTTPException` 5xx | ERROR | |
| `HTTPException` 4xx (404, 400, ...) | WARNING | Turn off with `LOG_CLIENT_ERRORS=false` in `.env` |
| Request validation failure (422) | WARNING | Which fields failed is in `context.errors` |
| Mobile app crash / uncaught JS error | ERROR / CRITICAL | Sent by `Mobile/src/lib/errorReporter.ts` |

Every response carries an `X-Request-ID` header. Look it up with
`SELECT * FROM error_log WHERE request_id = '...'`.

## Logging errors from your own code

```python
import logging
log = logging.getLogger("bjj.sessions")   # any name starting with "bjj."

try:
    ...
except Exception:
    log.exception("Could not save session", extra={"context": {"gym": gym_name}})
```

Or, without the logging module:

```python
from app.error_logging import capture_exception, record_error

capture_exception(exc, context={"session_id": 5})
record_error("Belt promotion skipped: no instructor", level="WARNING")
```

## Querying

- SQL: `sql/error_queries.sql` has ready-made queries (top errors, per hour,
  per endpoint, per user, mobile crashes, search, resolve, cleanup).
  Open psql with `docker exec -it bjj-postgres psql -U postgres -d bjjbuddy`.
- API (also visible in http://localhost:8000/docs under **Errors**):
  - `GET /errors?level=ERROR&source=backend&resolved=false&search=...&since=2026-10-01`
  - `GET /errors/summary?hours=24`: grouped by fingerprint, most frequent first
  - `GET /errors/{id}`
  - `PATCH /errors/{id}/resolve` with body `{"resolved": true}`
  - `DELETE /errors/purge?older_than_days=90`

## Settings (`Backend/.env`, all optional)

```
ENVIRONMENT=development      # stored on every row
LOG_CLIENT_ERRORS=true       # log 4xx as WARNING
ADMIN_API_KEY=some-long-random-string
```

The read/resolve/purge endpoints expose stack traces, so outside
`ENVIRONMENT=development` they need the header `X-Admin-Key: <ADMIN_API_KEY>`.

## Linking errors to users

There is no login yet, so the API reads the user from an `X-User-Id` header
(and the mobile reporter sends `user_id` set via `setErrorUser(id)`). When you
add JWT auth, change `_user_id_from_headers` in `app/error_middleware.py` to
read the user id from the verified token.
