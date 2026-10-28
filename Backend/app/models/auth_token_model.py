from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class AuthToken(SQLModel, table=True):
    """A login session. One row per device the user is logged in on.

    We never store the raw token, only its SHA-256 hash, so a leaked database
    can't be used to log in. Logging out deletes the row, which makes the
    token useless immediately (unlike a plain JWT, which stays valid until it expires).
    """

    __tablename__ = "auth_token"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    token_hash: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    user_agent: Optional[str] = None
