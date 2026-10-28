"""Endpoints for the error log.

POST  /errors/client            the mobile app reports a crash/error (open)
GET   /errors                   list/filter errors              (admin)
GET   /errors/summary           errors grouped by fingerprint   (admin)
GET   /errors/{id}              one error with full stack trace (admin)
PATCH /errors/{id}/resolve      mark resolved / unresolved      (admin)
DELETE /errors/purge            delete old rows                 (admin)

Admin endpoints need the X-Admin-Key header to match ADMIN_API_KEY in .env.
With no ADMIN_API_KEY set they work only when ENVIRONMENT=development.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import case, delete, func, update
from sqlmodel import Session, col, select

from app.config import settings
from app.database import get_session
from app.error_logging import make_fingerprint, record_error
from app.error_middleware import _user_id_from_headers
from app.models.error_log_model import ErrorLog

router = APIRouter(prefix="/errors", tags=["Errors"])


def require_admin(x_admin_key: Optional[str] = Header(default=None)) -> None:
    if settings.admin_api_key:
        if not x_admin_key or not secrets.compare_digest(x_admin_key, settings.admin_api_key):
            raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Key")
    elif settings.environment != "development":
        raise HTTPException(status_code=403, detail="Set ADMIN_API_KEY to use the error log API outside development")


# ---------- mobile reports ----------

class ClientErrorReport(BaseModel):
    message: str = Field(max_length=10_000)
    error_type: Optional[str] = Field(default=None, max_length=200)
    stack_trace: Optional[str] = Field(default=None, max_length=50_000)
    level: str = Field(default="ERROR", pattern="^(WARNING|ERROR|CRITICAL)$")
    is_fatal: bool = False
    platform: Optional[str] = Field(default=None, max_length=20)
    app_version: Optional[str] = Field(default=None, max_length=50)
    screen: Optional[str] = Field(default=None, max_length=200)
    user_id: Optional[int] = None
    context: Optional[dict[str, Any]] = None


@router.post("/client", status_code=status.HTTP_202_ACCEPTED)
def report_client_error(report: ClientErrorReport, request: Request):
    context = dict(report.context or {})
    context["is_fatal"] = report.is_fatal
    if report.screen:
        context["screen"] = report.screen
    # Group by error type + first line of the JS stack, so repeat crashes collapse together.
    first_frame = next((l.strip() for l in (report.stack_trace or "").splitlines()[1:] if l.strip()), "")
    error_id = record_error(
        report.message,
        level="CRITICAL" if report.is_fatal else report.level,
        source="mobile",
        error_type=report.error_type,
        stack_trace=report.stack_trace,
        fingerprint=make_fingerprint("mobile", report.error_type, first_frame or report.message[:200], report.screen),
        context=context,
        platform=report.platform,
        app_version=report.app_version,
        user_id=report.user_id or _user_id_from_headers(request),
        # This request itself isn't the error, so don't attach its path/method.
        http_method=None, path=None, route=None,
    )
    return {"id": error_id}


# ---------- querying ----------

@router.get("", response_model=list[ErrorLog], dependencies=[Depends(require_admin)])
def list_errors(
    db: Session = Depends(get_session),
    level: Optional[str] = None,
    source: Optional[str] = Query(default=None, description="backend or mobile"),
    resolved: Optional[bool] = None,
    status_code: Optional[int] = None,
    route: Optional[str] = None,
    user_id: Optional[int] = None,
    request_id: Optional[str] = None,
    fingerprint: Optional[str] = None,
    search: Optional[str] = Query(default=None, description="text to look for in the message"),
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
):
    q = select(ErrorLog)
    if level:
        q = q.where(ErrorLog.level == level.upper())
    if source:
        q = q.where(ErrorLog.source == source)
    if resolved is not None:
        q = q.where(ErrorLog.resolved == resolved)
    if status_code:
        q = q.where(ErrorLog.status_code == status_code)
    if route:
        q = q.where(ErrorLog.route == route)
    if user_id:
        q = q.where(ErrorLog.user_id == user_id)
    if request_id:
        q = q.where(ErrorLog.request_id == request_id)
    if fingerprint:
        q = q.where(ErrorLog.fingerprint == fingerprint)
    if search:
        q = q.where(col(ErrorLog.message).ilike(f"%{search}%"))
    if since:
        q = q.where(col(ErrorLog.created_at) >= since)
    if until:
        q = q.where(col(ErrorLog.created_at) < until)
    q = q.order_by(col(ErrorLog.created_at).desc(), col(ErrorLog.id).desc()).offset(offset).limit(limit)
    return db.exec(q).all()


@router.get("/summary", dependencies=[Depends(require_admin)])
def error_summary(
    db: Session = Depends(get_session),
    hours: int = Query(default=24 * 7, ge=1, le=24 * 365),
    include_resolved: bool = False,
    min_level: str = Query(default="WARNING", pattern="^(WARNING|ERROR|CRITICAL)$"),
):
    """Distinct errors in the last `hours`, most frequent first."""
    levels = ["WARNING", "ERROR", "CRITICAL"]
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    # Worst level in the group (alphabetical max would wrongly rank WARNING highest).
    rank = case((ErrorLog.level == "CRITICAL", 3), (ErrorLog.level == "ERROR", 2), else_=1)
    worst_level = case((func.max(rank) == 3, "CRITICAL"), (func.max(rank) == 2, "ERROR"), else_="WARNING")
    q = (
        select(
            ErrorLog.fingerprint,
            func.count().label("occurrences"),
            func.count(func.distinct(ErrorLog.user_id)).label("users_affected"),
            func.min(ErrorLog.created_at).label("first_seen"),
            func.max(ErrorLog.created_at).label("last_seen"),
            worst_level.label("level"),
            func.max(ErrorLog.source).label("source"),
            func.max(ErrorLog.error_type).label("error_type"),
            func.max(ErrorLog.route).label("route"),
            func.max(ErrorLog.message).label("sample_message"),
            func.max(ErrorLog.id).label("latest_id"),
        )
        .where(col(ErrorLog.created_at) >= since)
        .where(col(ErrorLog.level).in_(levels[levels.index(min_level):]))
        .group_by(ErrorLog.fingerprint)
        .order_by(func.count().desc())
    )
    if not include_resolved:
        q = q.where(ErrorLog.resolved == False)  # noqa: E712
    return [dict(r._mapping) for r in db.exec(q).all()]


@router.get("/{error_id}", response_model=ErrorLog, dependencies=[Depends(require_admin)])
def get_error(error_id: int, db: Session = Depends(get_session)):
    row = db.get(ErrorLog, error_id)
    if not row:
        raise HTTPException(status_code=404, detail="Error log entry not found")
    return row


class ResolveRequest(BaseModel):
    resolved: bool = True
    all_matching: bool = Field(default=True, description="Apply to every row with the same fingerprint")


@router.patch("/{error_id}/resolve", dependencies=[Depends(require_admin)])
def resolve_error(error_id: int, body: ResolveRequest, db: Session = Depends(get_session)):
    row = db.get(ErrorLog, error_id)
    if not row:
        raise HTTPException(status_code=404, detail="Error log entry not found")
    target = ErrorLog.fingerprint == row.fingerprint if body.all_matching else ErrorLog.id == error_id
    result = db.exec(
        update(ErrorLog)
        .where(target)
        .values(resolved=body.resolved, resolved_at=datetime.now(timezone.utc) if body.resolved else None)
    )
    db.commit()
    return {"updated": result.rowcount, "fingerprint": row.fingerprint, "resolved": body.resolved}


@router.delete("/purge", dependencies=[Depends(require_admin)])
def purge_errors(
    older_than_days: int = Query(default=90, ge=1),
    only_resolved: bool = False,
    db: Session = Depends(get_session),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    stmt = delete(ErrorLog).where(col(ErrorLog.created_at) < cutoff)
    if only_resolved:
        stmt = stmt.where(ErrorLog.resolved == True)  # noqa: E712
    result = db.exec(stmt)
    db.commit()
    return {"deleted": result.rowcount}
