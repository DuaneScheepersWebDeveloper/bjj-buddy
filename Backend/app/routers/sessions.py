"""Training sessions: log, list, edit and delete your own sessions, plus the technique library.

Built for the app's offline outbox:
  - the phone picks each session's id (a UUID), so a session logged offline can be edited
    or deleted before it has reached the server;
  - PUT /sessions/{id} creates the session or replaces it, so sending it twice is harmless;
  - deleting a session that's already gone succeeds.

Everyone only ever sees their own sessions.
"""

import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.database import get_session
from app.models.training_model import SessionEntry, Technique, TrainingSession
from app.models.user_model import User
from app.security import get_current_user

router = APIRouter(tags=["Training sessions"])

_ID = re.compile(r"^[A-Za-z0-9-]{8,40}$")

Category = Literal["submission", "pass", "sweep", "escape", "takedown", "position"]
Position = Literal["standing", "top", "bottom"]
MAX_TEXT = 2000  # characters per notes box: detailed but brief


def _tidy(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    v = v.strip()
    return v or None


def _tidy_name(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("Technique name can't be empty")
    return v


# --- Shapes -------------------------------------------------------------------


class TechniqueOut(BaseModel):
    id: int
    name: str
    category: str
    position: str
    custom: bool  # True = one you added yourself


class EntryIn(BaseModel):
    name: str = Field(max_length=60)
    category: Category
    position: Position
    result: Literal["hit", "conceded"]
    count: int = Field(default=1, ge=1, le=50)
    technique_id: Optional[int] = None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return _tidy_name(v)


class EntryOut(BaseModel):
    name: str
    category: str
    position: str
    result: str
    count: int
    technique_id: Optional[int]


class SessionIn(BaseModel):
    trained_on: date
    location: Optional[str] = Field(default=None, max_length=80)
    duration_min: int = Field(ge=5, le=600)
    attire: Literal["gi", "nogi"]
    session_type: Literal["class", "open_mat", "private", "competition"]
    went_right: Optional[str] = Field(default=None, max_length=MAX_TEXT)
    went_wrong: Optional[str] = Field(default=None, max_length=MAX_TEXT)
    to_improve: Optional[str] = Field(default=None, max_length=MAX_TEXT)
    entries: list[EntryIn] = Field(default_factory=list, max_length=100)
    # When it was first logged on the phone (optional; defaults to now).
    created_at: Optional[datetime] = None

    @field_validator("location", "went_right", "went_wrong", "to_improve")
    @classmethod
    def _text(cls, v: Optional[str]) -> Optional[str]:
        return _tidy(v)

    @field_validator("trained_on")
    @classmethod
    def _date(cls, v: date) -> date:
        today = date.today()
        if v > today + timedelta(days=1):  # +1 day: the phone may be a timezone ahead
            raise ValueError("The session date can't be in the future")
        if v < date(1990, 1, 1):
            raise ValueError("Check the session date")
        return v


class SessionOut(BaseModel):
    id: str
    trained_on: date
    location: Optional[str]
    duration_min: int
    attire: str
    session_type: str
    went_right: Optional[str]
    went_wrong: Optional[str]
    to_improve: Optional[str]
    entries: list[EntryOut]
    subs_for: int  # submissions you got
    subs_against: int  # times you were submitted
    created_at: datetime
    updated_at: datetime


# --- Helpers ------------------------------------------------------------------


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _out(s: TrainingSession, entries: list[SessionEntry]) -> SessionOut:
    subs = [e for e in entries if e.category == "submission"]
    return SessionOut(
        id=s.id,
        trained_on=s.trained_on,
        location=s.location,
        duration_min=s.duration_min,
        attire=s.attire,
        session_type=s.session_type,
        went_right=s.went_right,
        went_wrong=s.went_wrong,
        to_improve=s.to_improve,
        entries=[
            EntryOut(
                name=e.name,
                category=e.category,
                position=e.position,
                result=e.result,
                count=e.count,
                technique_id=e.technique_id,
            )
            for e in entries
        ],
        subs_for=sum(e.count for e in subs if e.result == "hit"),
        subs_against=sum(e.count for e in subs if e.result == "conceded"),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


def _entries_for(db: Session, session_ids: list[str]) -> dict[str, list[SessionEntry]]:
    by_session: dict[str, list[SessionEntry]] = {sid: [] for sid in session_ids}
    if session_ids:
        rows = db.exec(
            select(SessionEntry).where(SessionEntry.session_id.in_(session_ids)).order_by(SessionEntry.id)
        ).all()
        for e in rows:
            by_session[e.session_id].append(e)
    return by_session


def _own_session(db: Session, session_id: str, user: User) -> Optional[TrainingSession]:
    s = db.get(TrainingSession, session_id)
    if s is not None and s.user_id != user.id:
        # Don't reveal that someone else's session exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return s


def _resolve_technique(db: Session, entry: EntryIn, user: User) -> Technique:
    """Find the technique (built-in or the user's own); add it to the user's own if it's new."""
    if entry.technique_id is not None:
        t = db.get(Technique, entry.technique_id)
        if t is not None and (t.user_id is None or t.user_id == user.id):
            return t
    t = db.exec(
        select(Technique).where(
            func.lower(Technique.name) == entry.name.lower(),
            or_(Technique.user_id.is_(None), Technique.user_id == user.id),
        )
    ).first()
    if t is None:
        t = Technique(name=entry.name, category=entry.category, position=entry.position, user_id=user.id)
        db.add(t)
        db.flush()
    return t


# --- Technique library --------------------------------------------------------


@router.get("/techniques", response_model=list[TechniqueOut])
def list_techniques(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """The built-in library plus techniques you've added yourself."""
    rows = db.exec(
        select(Technique)
        .where(or_(Technique.user_id.is_(None), Technique.user_id == user.id))
        .order_by(Technique.category, Technique.name)
    ).all()
    return [
        TechniqueOut(id=t.id, name=t.name, category=t.category, position=t.position, custom=t.user_id is not None)
        for t in rows
    ]


# --- Sessions -----------------------------------------------------------------


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Your sessions, newest first."""
    sessions = db.exec(
        select(TrainingSession)
        .where(TrainingSession.user_id == user.id)
        .order_by(TrainingSession.trained_on.desc(), TrainingSession.created_at.desc())
        .limit(limit)
    ).all()
    entries = _entries_for(db, [s.id for s in sessions])
    return [_out(s, entries[s.id]) for s in sessions]


@router.get("/sessions/{session_id}", response_model=SessionOut)
def get_session_log(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = _own_session(db, session_id, user)
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return _out(s, _entries_for(db, [s.id])[s.id])


@router.put("/sessions/{session_id}", response_model=SessionOut)
def save_session(
    session_id: str,
    body: SessionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    """Create the session, or replace it if it already exists (used for both logging and editing)."""
    if not _ID.match(session_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid session id")

    now = datetime.now(timezone.utc)
    s = _own_session(db, session_id, user)
    if s is None:
        created = _as_utc(body.created_at) if body.created_at else now
        s = TrainingSession(id=session_id, user_id=user.id, created_at=min(created, now), **_fields(body))
    else:
        for key, value in _fields(body).items():
            setattr(s, key, value)
        for old in db.exec(select(SessionEntry).where(SessionEntry.session_id == s.id)).all():
            db.delete(old)
    s.updated_at = now
    db.add(s)
    db.flush()

    # Same technique twice in the list? Add the counts together.
    merged: dict[tuple[str, str], EntryIn] = {}
    for e in body.entries:
        key = (e.name.lower(), e.result)
        if key in merged:
            merged[key].count = min(50, merged[key].count + e.count)
        else:
            merged[key] = e.model_copy()

    for e in merged.values():
        t = _resolve_technique(db, e, user)
        db.add(
            SessionEntry(
                session_id=s.id,
                technique_id=t.id,
                name=t.name,
                category=t.category,
                position=t.position,
                result=e.result,
                count=e.count,
            )
        )
    db.commit()
    db.refresh(s)
    return _out(s, _entries_for(db, [s.id])[s.id])


def _fields(body: SessionIn) -> dict:
    return body.model_dump(exclude={"entries", "created_at"})


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = _own_session(db, session_id, user)
    if s is not None:  # already gone counts as success
        for e in db.exec(select(SessionEntry).where(SessionEntry.session_id == s.id)).all():
            db.delete(e)
        db.flush()
        db.delete(s)
        db.commit()
    return None
