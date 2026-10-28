from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class PasswordResetCode(SQLModel, table=True):
    """A one-time 6-digit code emailed to a user who forgot their password.

    Only a keyed hash of the code is stored. Each user has at most one active
    code; asking for a new one replaces the old one.
    """

    __tablename__ = "password_reset_code"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True, unique=True)
    code_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    attempts: int = Field(default=0)
