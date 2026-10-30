from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


class AdminTask(SQLModel, table=True):
    """An idea / to-do on the admins' shared Tasks list.

    The id is a random UUID made by the phone, so a task added offline can be
    ticked off or deleted before it has even reached the server.
    """

    __tablename__ = "admin_task"

    id: str = Field(primary_key=True, max_length=40)
    title: str
    done: bool = Field(default=False)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    # When it was added on the phone (may be earlier than when it reached the server).
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
