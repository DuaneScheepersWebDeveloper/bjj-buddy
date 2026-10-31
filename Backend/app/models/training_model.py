from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Technique(SQLModel, table=True):
    """A BJJ technique, e.g. "Armbar from guard" (submission, bottom).

    Built-in techniques (from app/techniques_seed.py) have user_id = None.
    Techniques a user types in while logging belong to that user only.
    """

    __tablename__ = "technique"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    category: str  # submission | pass | sweep | escape | takedown | position
    position: str  # standing | top | bottom
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrainingSession(SQLModel, table=True):
    """One training session someone logged.

    The id is a random UUID made by the phone, so a session can be logged offline
    and uploaded later without ever being saved twice.
    """

    __tablename__ = "training_session"

    id: str = Field(primary_key=True, max_length=40)
    user_id: int = Field(foreign_key="user.id", index=True)
    trained_on: date = Field(index=True)
    location: Optional[str] = None
    duration_min: int
    attire: str  # gi | nogi
    session_type: str  # class | open_mat | private | competition
    went_right: Optional[str] = None
    went_wrong: Optional[str] = None
    to_improve: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionEntry(SQLModel, table=True):
    """A technique in a session: something you pulled off ("hit") or that was done to you ("conceded").

    count = how many times, e.g. 2 armbars. The name/category/position are copied from the
    technique so old logs read the same even if the library changes.
    """

    __tablename__ = "session_entry"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="training_session.id", index=True, max_length=40)
    technique_id: Optional[int] = Field(default=None, foreign_key="technique.id")
    name: str
    category: str
    position: str
    result: str  # hit | conceded
    count: int = Field(default=1)
