from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Column
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
    # Deliberate-practice loop (Quick Log). All optional so older logs stay valid.
    # focus_id: the focus you worked on this session (no foreign key on purpose: the
    #   phone may upload a session before or after the focus it belongs to).
    focus_id: Optional[str] = Field(default=None, max_length=40, index=True)
    energy: Optional[int] = None  # 1 (empty tank) .. 5 (felt great)
    adjustment: Optional[str] = None  # the ONE thing to change next time
    # Who you rolled with: [{"name": "Sam", "traits": ["bigger"], "outcome": "tapped_by"}].
    # JSON so new partner details can be added later without a migration.
    partners: list = Field(default_factory=list, sa_column=Column(JSON, nullable=False, server_default="[]"))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Focus(SQLModel, table=True):
    """The ONE thing you're deliberately working on, e.g. "Knee-cut pass".

    Only one is active at a time (ended_on is NULL). Ending it keeps it as history, with an
    outcome and a short reflection. The id is a UUID from the phone, like sessions.
    """

    __tablename__ = "focus"

    id: str = Field(primary_key=True, max_length=40)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str
    why: Optional[str] = None  # what you want to get better at, in your words
    target_sessions: int = Field(default=8)  # sessions before it's time to review it
    started_on: date
    ended_on: Optional[date] = None  # NULL = this is your active focus
    outcome: Optional[str] = None  # got_it | keep_going | parked
    reflection: Optional[str] = None
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


class SessionNote(SQLModel, table=True):
    """A coach's note on a student's session (one note per coach per session)."""

    __tablename__ = "session_note"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="training_session.id", index=True, max_length=40)
    coach_id: int = Field(foreign_key="user.id", index=True)
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
