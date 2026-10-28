"""Error logging to the `error_log` table.

Three ways errors get recorded:
  1. Automatically, by ErrorLoggingMiddleware (app/error_middleware.py), for any
     unhandled exception or 4xx/5xx HTTP error in a request.
  2. Any `logging` call at ERROR or above on a logger under "bjj", e.g.
         log = logging.getLogger("bjj.sessions")
         log.exception("Could not save session", extra={"context": {"gym": name}})
  3. Directly: capture_exception(exc, context={...}) inside an except block.

Writing a log row must never break the app, so every write uses its own DB
session (independent of the request's transaction, which may be rolled back)
and any failure falls back to the console logger.
"""

from __future__ import annotations

import contextvars
import hashlib
import logging
import os
import threading
import traceback
from typing import Any, Optional

from sqlmodel import Session

from app.config import settings

# Console logger used when the database itself can't be written to.
# Deliberately outside the "bjj" hierarchy so it never loops back into the DB handler.
fallback_log = logging.getLogger("error_logging.fallback")

MAX_TEXT = 20_000          # chars kept for message / stack trace
MAX_FIELD = 2_000          # chars kept for any single string inside JSON fields
SENSITIVE_KEYS = ("password", "passwd", "secret", "token", "authorization", "api_key", "apikey", "cookie", "hashed_password")

# Details of the request currently being handled (set by the middleware).
request_context: contextvars.ContextVar[Optional[dict[str, Any]]] = contextvars.ContextVar(
    "error_log_request_context", default=None
)

_writing = threading.local()  # guards against recursion if the DB write itself logs an error

APP_DIR = os.path.dirname(os.path.abspath(__file__))


# ---------- helpers ----------

def scrub(value: Any, _depth: int = 0) -> Any:
    """Redact sensitive keys and truncate long values, recursively."""
    if _depth > 6:
        return "[too deep]"
    if isinstance(value, dict):
        out = {}
        for k, v in list(value.items())[:100]:
            key = str(k)
            if any(s in key.lower() for s in SENSITIVE_KEYS):
                out[key] = "[REDACTED]"
            else:
                out[key] = scrub(v, _depth + 1)
        return out
    if isinstance(value, (list, tuple)):
        return [scrub(v, _depth + 1) for v in list(value)[:100]]
    if isinstance(value, str):
        return value if len(value) <= MAX_FIELD else value[:MAX_FIELD] + "…[truncated]"
    if value is None or isinstance(value, (int, float, bool)):
        return value
    return scrub(str(value), _depth + 1)


def _truncate(text: Optional[str], limit: int = MAX_TEXT) -> Optional[str]:
    if text is None:
        return None
    return text if len(text) <= limit else text[:limit] + "\n…[truncated]"


def _app_frame(exc: BaseException) -> Optional[str]:
    """Innermost traceback frame inside our own code, as 'file:function'."""
    found = None
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename.startswith(APP_DIR):
            found = f"{os.path.relpath(frame.filename, APP_DIR)}:{frame.name}"
    return found


def _current_route() -> Optional[str]:
    scope = (request_context.get() or {}).get("_scope")
    return getattr(scope.get("route"), "path", None) if scope else None


def make_fingerprint(*parts: Optional[str]) -> str:
    raw = "|".join(p or "" for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def format_stack(exc: BaseException) -> str:
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


# ---------- writing ----------

def record_error(
    message: str,
    *,
    level: str = "ERROR",
    source: str = "backend",
    error_type: Optional[str] = None,
    stack_trace: Optional[str] = None,
    fingerprint: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
    **fields: Any,
) -> Optional[int]:
    """Insert one row into error_log. Returns the new id, or None if the write failed.

    Request details (request_id, path, user, ...) are filled in automatically from
    the current request when called during one; pass them in `fields` to override.
    """
    if getattr(_writing, "active", False):
        return None
    _writing.active = True
    try:
        # Imported here to avoid a circular import (database -> models -> ...).
        from app.database import engine
        from app.models.error_log_model import ErrorLog

        data: dict[str, Any] = dict(request_context.get() or {})
        scope = data.pop("_scope", None)
        if scope is not None:  # route template is only known after routing ran
            data["route"] = getattr(scope.get("route"), "path", None)
        data.update(fields)  # explicit values (even None) win over the request context

        row = ErrorLog(
            level=level.upper(),
            source=source,
            environment=settings.environment,
            error_type=error_type,
            message=_truncate(message or "(no message)"),
            stack_trace=_truncate(stack_trace),
            fingerprint=fingerprint or make_fingerprint(source, error_type, data.get("route"), (message or "")[:200]),
            context=scrub(context) if context else None,
            query_params=scrub(data.pop("query_params", None)),
            request_body=scrub(data.pop("request_body", None)),
            **{k: v for k, v in data.items() if k in ErrorLog.model_fields},
        )
        with Session(engine) as db:
            db.add(row)
            db.commit()
            db.refresh(row)
            return row.id
    except Exception:  # never let logging crash the app
        fallback_log.exception("Could not write error to error_log table. Original error: %s", message)
        return None
    finally:
        _writing.active = False


def capture_exception(
    exc: BaseException,
    *,
    level: str = "ERROR",
    context: Optional[dict[str, Any]] = None,
    **fields: Any,
) -> Optional[int]:
    """Record an exception you caught yourself:

        try:
            ...
        except Exception as exc:
            capture_exception(exc, context={"session_id": 5})
            raise   # or handle it
    """
    error_type = type(exc).__name__
    return record_error(
        str(exc) or error_type,
        level=level,
        error_type=error_type,
        stack_trace=format_stack(exc),
        fingerprint=make_fingerprint("backend", error_type, _app_frame(exc), _current_route()),
        context=context,
        **fields,
    )


# ---------- logging integration ----------

class DatabaseLogHandler(logging.Handler):
    """Sends ERROR+ log records from the "bjj" logger tree to error_log."""

    def __init__(self) -> None:
        super().__init__(level=logging.ERROR)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
            exc = record.exc_info[1] if record.exc_info else None
            context = getattr(record, "context", None)
            ctx = dict(context) if isinstance(context, dict) else {}
            ctx.update({"logger": record.name, "location": f"{record.pathname}:{record.lineno} in {record.funcName}"})
            if exc is not None:
                error_type = type(exc).__name__
                stack = format_stack(exc)
                message = f"{message}: {exc}" if str(exc) else message
                fp = make_fingerprint("backend", error_type, _app_frame(exc), record.name, _current_route())
            else:
                error_type = None
                stack = "".join(traceback.format_stack()[:-1])  # where the log call was made
                fp = make_fingerprint("backend", record.name, record.pathname, str(record.lineno))
            record_error(
                message,
                level=record.levelname,
                error_type=error_type,
                stack_trace=stack,
                fingerprint=fp,
                context=ctx,
            )
        except Exception:
            self.handleError(record)


def setup_error_logging() -> None:
    """Attach the DB handler to the "bjj" logger. Call once at startup."""
    logger = logging.getLogger("bjj")
    if not any(isinstance(h, DatabaseLogHandler) for h in logger.handlers):
        logger.addHandler(DatabaseLogHandler())
    if logger.level == logging.NOTSET:
        logger.setLevel(logging.INFO)
