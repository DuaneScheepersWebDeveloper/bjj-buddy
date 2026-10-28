from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column, DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

# JSONB on Postgres (indexable, queryable with ->> etc.), plain JSON elsewhere.
JSONType = JSON().with_variant(JSONB(), "postgresql")


class ErrorLog(SQLModel, table=True):
    """One row per captured error, from the API or from the mobile app.

    Rows with the same `fingerprint` are the "same" error, so you can GROUP BY
    fingerprint to see how often each distinct problem happens.
    """

    __tablename__ = "error_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True, server_default=func.now()),
    )

    # What happened
    level: str = Field(default="ERROR", index=True)          # WARNING | ERROR | CRITICAL
    source: str = Field(default="backend", index=True)       # backend | mobile
    environment: str = Field(default="development", index=True)
    error_type: Optional[str] = Field(default=None, index=True)  # e.g. IntegrityError, HTTP 404
    message: str = Field(sa_column=Column(Text, nullable=False))
    stack_trace: Optional[str] = Field(default=None, sa_column=Column(Text))
    fingerprint: str = Field(index=True)                      # groups identical errors

    # Where it happened (HTTP requests)
    request_id: Optional[str] = Field(default=None, index=True)
    http_method: Optional[str] = None
    path: Optional[str] = None                                # actual URL path, e.g. /users/12
    route: Optional[str] = Field(default=None, index=True)    # route template, e.g. /users/{user_id}
    status_code: Optional[int] = Field(default=None, index=True)
    query_params: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONType))
    request_body: Optional[Any] = Field(default=None, sa_column=Column(JSONType))  # sensitive keys redacted

    # Who / what client
    user_id: Optional[int] = Field(default=None, index=True)  # no FK on purpose: logs outlive users
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    platform: Optional[str] = None                            # ios | android | web (mobile reports)
    app_version: Optional[str] = None

    # Anything else useful
    context: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONType))

    # Triage
    resolved: bool = Field(default=False, index=True)
    resolved_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True)))
