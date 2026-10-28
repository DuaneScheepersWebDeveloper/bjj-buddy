"""Captures request errors into the error_log table.

- ErrorLoggingMiddleware: gives every request an X-Request-ID, remembers the
  request body (first 16 KB) and catches any unhandled exception, logs it,
  and returns a clean 500 JSON response that includes the request_id.
- register_exception_handlers(): logs HTTPExceptions (4xx/5xx) and request
  validation errors, then returns FastAPI's normal responses.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings
from app.error_logging import (
    _app_frame,
    format_stack,
    make_fingerprint,
    record_error,
    request_context,
)

log = logging.getLogger("error_logging.fallback")
MAX_BODY_BYTES = 16 * 1024


def _parse_body(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw[:2000].decode("utf-8", errors="replace")


def _route_template(scope: Scope) -> Optional[str]:
    route = scope.get("route")
    return getattr(route, "path", None)


def _user_id_from_headers(request: Request) -> Optional[int]:
    # There is no auth yet, so the app can send X-User-Id. Once login/JWT exists,
    # replace this with the user id taken from the verified token.
    value = request.headers.get("x-user-id")
    try:
        return int(value) if value else None
    except ValueError:
        return None


def _request_fields(request: Request) -> dict[str, Any]:
    state = request.scope.get("state") or {}
    return {
        "request_id": state.get("request_id"),
        "http_method": request.method,
        "path": request.url.path,
        "route": _route_template(request.scope),
        "query_params": dict(request.query_params) or None,
        "request_body": _parse_body(bytes(state.get("raw_body") or b"")),
        "user_id": _user_id_from_headers(request),
        "client_ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }


class ErrorLoggingMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        request_id = headers.get(b"x-request-id", b"").decode("latin-1")[:64] or uuid.uuid4().hex
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        body = bytearray()
        state["raw_body"] = body

        request = Request(scope)
        token = request_context.set({
            "_scope": scope,
            "request_id": request_id,
            "http_method": request.method,
            "path": request.url.path,
            "user_id": _user_id_from_headers(request),
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        })

        async def receive_wrapper() -> Message:
            message = await receive()
            if message["type"] == "http.request" and len(body) < MAX_BODY_BYTES:
                body.extend(message.get("body", b"")[: MAX_BODY_BYTES - len(body)])
            return message

        response_started = False

        async def send_wrapper(message: Message) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
                MutableHeaders(scope=message).append("X-Request-ID", request_id)
            await send(message)

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except Exception as exc:
            log.exception("Unhandled error on %s %s (request_id=%s)", request.method, request.url.path, request_id)
            fields = _request_fields(request)
            error_type = type(exc).__name__
            await run_in_threadpool(
                record_error,
                str(exc) or error_type,
                level="ERROR",
                error_type=error_type,
                stack_trace=format_stack(exc),
                fingerprint=make_fingerprint("backend", error_type, _app_frame(exc), fields["route"]),
                status_code=500,
                **fields,
            )
            if response_started:
                raise
            response = JSONResponse(
                {"detail": "Internal server error", "request_id": request_id}, status_code=500
            )
            await response(scope, receive, send_wrapper)
        finally:
            request_context.reset(token)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def _log_http_exception(request: Request, exc: StarletteHTTPException):
        code = exc.status_code
        if code >= 500 or (code >= 400 and settings.log_client_errors):
            fields = _request_fields(request)
            await run_in_threadpool(
                record_error,
                str(exc.detail),
                level="ERROR" if code >= 500 else "WARNING",
                error_type=f"HTTP {code}",
                fingerprint=make_fingerprint("backend", f"HTTP {code}", fields["route"] or fields["path"], str(exc.detail)[:200]),
                status_code=code,
                **fields,
            )
        return await http_exception_handler(request, exc)

    @app.exception_handler(RequestValidationError)
    async def _log_validation_error(request: Request, exc: RequestValidationError):
        if settings.log_client_errors:
            fields = _request_fields(request)
            errors = jsonable_encoder(exc.errors())
            summary = "; ".join(
                f"{'.'.join(str(p) for p in e.get('loc', []))}: {e.get('msg')}" for e in errors
            )
            await run_in_threadpool(
                record_error,
                f"Validation failed: {summary}"[:2000],
                level="WARNING",
                error_type="RequestValidationError",
                fingerprint=make_fingerprint("backend", "RequestValidationError", fields["route"] or fields["path"]),
                status_code=422,
                context={"errors": errors},
                **fields,
            )
        return await request_validation_exception_handler(request, exc)
