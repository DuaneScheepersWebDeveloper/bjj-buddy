from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone

class Session(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    gym_name: str
    duration_min: int
    notes: Optional[str] = None