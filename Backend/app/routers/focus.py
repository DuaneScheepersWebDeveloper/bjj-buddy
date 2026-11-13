"""Your focus: the ONE thing you're deliberately working on.

Deliberate practice works best with a single target at a time, so the app keeps exactly one
active focus per person. Starting a new one automatically ends the old one (it stays in your
history with how it went).

Built for the app's offline outbox, like sessions: the phone picks the id (a UUID) and PUT
creates or replaces, so sending the same change twice is harmless.

  GET    /focus              all your focuses, active first, then newest first
  PUT    /focus/{id}         create or update one
  DELETE /focus/{id}         remove one (sessions keep their focus_id; it just won't match)
"""

import re
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.database import get_session
from app.models.training_model import Focus
from app.models.user_model import User
from app.security import get_current_user

router = APIRouter(prefix="/focus", tags=["Focus"])

_ID = re.compile(r"^[A-Za-z0-9-]{8,40}$")


class FocusIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    why: Optional[str] = Field(default=None, max_length=300)
    target_sessions: int = Field(default=8, ge=1, le=100)
    started_on: date
    ended_on: Optional[date] = None
    outcome: Optional[Literal["got_it", "keep_going", "parked"]] = None
    reflection: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Give your focus a name")
        return v

    @field_validator("why", "reflection")
    @classmethod
    def _text(cls, v: Optional[str]) -> Optional[str]:
        return (v.strip() or None) if v else None

    @field_validator("started_on", "ended_on")
    @classmethod
    def _date(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v > date.today() + timedelta(days=1):  # phone may be a timezone ahead
            raise ValueError("That date is in the future")
        return v


class FocusOut(BaseModel):
    id: str
    title: str
    why: Optional[str]
    target_sessions: int
    started_on: date
    ended_on: Optional[date]
    outcome: Optional[str]
    reflection: Optional[str]
    created_at: datetime
    updated_at: datetime


def _out(f: Focus) -> FocusOut:
    return FocusOut(**f.model_dump(exclude={"user_id"}))


@router.get("", response_model=list[FocusOut])
def list_focus(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    rows = db.exec(select(Focus).where(Focus.user_id == user.id)).all()
    active = [f for f in rows if f.ended_on is None]
    past = sorted((f for f in rows if f.ended_on is not None), key=lambda f: (f.ended_on, f.created_at), reverse=True)
    return [_out(f) for f in active + past]


@router.put("/{focus_id}", response_model=FocusOut)
def save_focus(focus_id: str, body: FocusIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if not _ID.match(focus_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid focus id")
    if body.ended_on is not None and body.ended_on < body.started_on:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A focus can't end before it starts")

    now = datetime.now(timezone.utc)
    f = db.get(Focus, focus_id)
    if f is not None and f.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Focus not found")

    # One active focus: making this one active ends any other.
    if body.ended_on is None:
        others = db.exec(
            select(Focus).where(Focus.user_id == user.id, Focus.ended_on.is_(None), Focus.id != focus_id)
        ).all()
        for other in others:
            other.ended_on = max(other.started_on, min(body.started_on, date.today()))
            other.outcome = other.outcome or "parked"
            other.updated_at = now
            db.add(other)
        db.flush()

    if f is None:
        f = Focus(id=focus_id, user_id=user.id, created_at=now, **body.model_dump())
    else:
        for key, value in body.model_dump().items():
            setattr(f, key, value)
    f.updated_at = now
    db.add(f)
    db.commit()
    db.refresh(f)
    return _out(f)


@router.delete("/{focus_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_focus(focus_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    f = db.get(Focus, focus_id)
    if f is not None and f.user_id == user.id:  # already gone (or not yours) counts as success
        db.delete(f)
        db.commit()
    return None
