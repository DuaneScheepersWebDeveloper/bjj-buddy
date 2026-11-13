from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class WeightEntry(SQLModel, table=True):
    """Your weight on a day (one per day; logging again that day replaces it)."""

    __tablename__ = "weight_entry"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    day: date
    weight_kg: float
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WaterLog(SQLModel, table=True):
    """How much water you drank on a day, in millilitres (one total per day)."""

    __tablename__ = "water_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    day: date
    ml: int
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
