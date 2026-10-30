"""Safe retries for the app's offline outbox.

When the phone saves something while offline, it later sends it with an
`Idempotency-Key` header (a random ID created on the phone). If the connection
drops after the server has saved it but before the phone hears back, the phone
sends the same request again. This middleware recognises the key and returns
the original answer instead of doing the work twice (e.g. logging a session twice).

Only successful (2xx) answers are remembered; they're kept for 7 days.
Requests without the header are not affected.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional

from sqlmodel import Field, Session, SQLModel, select
from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("idempotency")

HEADER = b"idempotency-key"
KEEP_FOR = timedelta(days=7)
METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class IdempotencyRecord(SQLModel, table=True):
    __tablename__ = "idempotency_record"

    key: str = Field(primary_key=True, max_length=100)
    method: str
    path: str
    status_code: int
    content_type: Optional[str] = None
    body: bytes = b""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


Stored = tuple[str, str, int, Optional[str], bytes]  # method, path, status, content-type, body


def _db_lookup(key: str) -> Optional[Stored]:
    from app.database import engine

    with Session(engine) as db:
        rec = db.get(IdempotencyRecord, key)
        if rec is None:
            return None
        return rec.method, rec.path, rec.status_code, rec.content_type, rec.body


def _db_save(key: str, method: str, path: str, status: int, content_type: Optional[str], body: bytes) -> None:
    from app.database import engine

    try:
        with Session(engine) as db:
            db.add(IdempotencyRecord(key=key, method=method, path=path, status_code=status, content_type=content_type, body=body))
            db.commit()
    except Exception:  # e.g. two identical retries at the same moment: the first one wins
        log.warning("Could not store idempotency record %s", key, exc_info=True)


def purge_old_records() -> None:
    """Delete remembered answers older than KEEP_FOR (called at startup)."""
    from app.database import engine

    cutoff = datetime.now(timezone.utc) - KEEP_FOR
    with Session(engine) as db:
        for rec in db.exec(select(IdempotencyRecord).where(IdempotencyRecord.created_at < cutoff)).all():
            db.delete(rec)
        db.commit()


class IdempotencyMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        lookup: Callable[[str], Optional[Stored]] = _db_lookup,
        save: Callable[[str, str, str, int, Optional[str], bytes], None] = _db_save,
    ) -> None:
        self.app = app
        self.lookup = lookup
        self.save = save

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in METHODS:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers") or [])
        raw = headers.get(HEADER, b"").decode("latin-1").strip()
        if not raw:
            await self.app(scope, receive, send)
            return
        if len(raw) > 100:
            await _json(send, 400, b'{"detail":"Idempotency-Key is too long"}')
            return

        method, path = scope["method"], scope["path"]
        found = await run_in_threadpool(self.lookup, raw)
        if found is not None:
            f_method, f_path, status, ctype, body = found
            if (f_method, f_path) != (method, path):
                await _json(send, 422, b'{"detail":"This Idempotency-Key was already used for a different request"}')
                return
            # Already done: replay the original answer.
            await send({
                "type": "http.response.start",
                "status": status,
                "headers": [(b"content-type", (ctype or "application/json").encode()), (b"idempotent-replayed", b"true")],
            })
            await send({"type": "http.response.body", "body": body})
            return

        status_holder: dict[str, object] = {}
        chunks: list[bytes] = []

        async def capture(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
                for k, v in message.get("headers", []):
                    if k.lower() == b"content-type":
                        status_holder["ctype"] = v.decode("latin-1")
            elif message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
            await send(message)

        await self.app(scope, receive, capture)

        status = int(status_holder.get("status", 500))
        if 200 <= status < 300:
            await run_in_threadpool(
                self.save, raw, method, path, status, status_holder.get("ctype"), b"".join(chunks)  # type: ignore[arg-type]
            )


async def _json(send: Send, status: int, body: bytes) -> None:
    await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
    await send({"type": "http.response.body", "body": body})
