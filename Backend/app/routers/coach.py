"""Coach tools: your students, their sessions, promotions and notes.

A coach's students are the active users whose profile gym matches the coach's gym
(ignoring capitals and extra spaces). Admins can do everything a coach can, for everyone.

  GET    /coach/students                      your students
  GET    /coach/students/{id}/sessions        a student's sessions (with notes)
  PATCH  /coach/students/{id}/rank            {belt_rank, stripes}: promote
  PUT    /coach/sessions/{session_id}/note    {text}: add or change your note
  DELETE /coach/sessions/{session_id}/note    remove your note
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select

from app.database import get_session
from app.models.training_model import SessionNote, TrainingSession
from app.models.user_model import BELTS, MAX_STRIPES, User
from app.routers.sessions import SessionOut, sessions_out
from app.security import require_coach

router = APIRouter(prefix="/coach", tags=["Coach"])

MAX_NOTE = 1000


class StudentOut(BaseModel):
    id: int
    full_name: str
    username: Optional[str]
    avatar_url: Optional[str]
    belt_rank: str
    stripes: int
    gym: Optional[str]
    role: str
    sessions_30d: int
    last_trained_on: Optional[date]


class RankUpdate(BaseModel):
    belt_rank: str
    stripes: int = Field(ge=0, le=MAX_STRIPES)

    @field_validator("belt_rank")
    @classmethod
    def _belt(cls, v: str) -> str:
        v = v.strip().capitalize()
        if v not in BELTS:
            raise ValueError(f"Belt must be one of: {', '.join(BELTS)}")
        return v


class NoteIn(BaseModel):
    text: str = Field(max_length=MAX_NOTE)


def _gym_key(gym: Optional[str]) -> str:
    return " ".join((gym or "").split()).lower()


def _students_query(coach: User):
    q = select(User).where(User.is_active == True, User.id != coach.id)  # noqa: E712
    if coach.is_admin:
        return q  # admins coach everyone
    gym = _gym_key(coach.gym)
    if not gym:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add your gym to your profile first, so BJJ Buddy knows who your students are.",
        )
    # Same gym, ignoring capitals and extra spaces.
    return q.where(func.lower(func.regexp_replace(func.trim(User.gym), r"\s+", " ", "g")) == gym)


def _student(db: Session, coach: User, student_id: int) -> User:
    """Load one of this coach's students, or 404 (also for people at other gyms)."""
    student = db.exec(_students_query(coach).where(User.id == student_id)).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student


@router.get("/students", response_model=list[StudentOut])
def list_students(coach: User = Depends(require_coach), db: Session = Depends(get_session)):
    """Your students, most recently trained first."""
    students = db.exec(_students_query(coach)).all()
    since = date.today() - timedelta(days=30)
    stats: dict[int, tuple[int, Optional[date]]] = {}
    if students:
        rows = db.exec(
            select(
                TrainingSession.user_id,
                func.count().filter(TrainingSession.trained_on >= since),
                func.max(TrainingSession.trained_on),
            )
            .where(TrainingSession.user_id.in_([s.id for s in students]))
            .group_by(TrainingSession.user_id)
        ).all()
        stats = {uid: (n, last) for uid, n, last in rows}
    out = [
        StudentOut(
            id=s.id,
            full_name=s.full_name,
            username=s.username,
            avatar_url=s.avatar_url,
            belt_rank=s.belt_rank,
            stripes=s.stripes,
            gym=s.gym,
            role=s.role,
            sessions_30d=stats.get(s.id, (0, None))[0],
            last_trained_on=stats.get(s.id, (0, None))[1],
        )
        for s in students
    ]
    return sorted(out, key=lambda s: (s.last_trained_on or date.min, s.full_name.lower()), reverse=True)


@router.get("/students/{student_id}/sessions", response_model=list[SessionOut])
def student_sessions(
    student_id: int,
    limit: int = Query(default=50, ge=1, le=300),
    coach: User = Depends(require_coach),
    db: Session = Depends(get_session),
):
    student = _student(db, coach, student_id)
    sessions = db.exec(
        select(TrainingSession)
        .where(TrainingSession.user_id == student.id)
        .order_by(TrainingSession.trained_on.desc(), TrainingSession.created_at.desc())
        .limit(limit)
    ).all()
    return sessions_out(db, list(sessions))


@router.patch("/students/{student_id}/rank", response_model=StudentOut)
def promote(student_id: int, body: RankUpdate, coach: User = Depends(require_coach), db: Session = Depends(get_session)):
    """Set a student's belt and stripes."""
    student = _student(db, coach, student_id)
    if student.is_admin and not coach.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can change an admin's rank")
    student.belt_rank = body.belt_rank
    student.stripes = body.stripes
    db.add(student)
    db.commit()
    db.refresh(student)
    last = db.exec(select(func.max(TrainingSession.trained_on)).where(TrainingSession.user_id == student.id)).one()
    n = db.exec(
        select(func.count())
        .select_from(TrainingSession)
        .where(TrainingSession.user_id == student.id, TrainingSession.trained_on >= date.today() - timedelta(days=30))
    ).one()
    return StudentOut(
        id=student.id,
        full_name=student.full_name,
        username=student.username,
        avatar_url=student.avatar_url,
        belt_rank=student.belt_rank,
        stripes=student.stripes,
        gym=student.gym,
        role=student.role,
        sessions_30d=n,
        last_trained_on=last,
    )


def _students_session(db: Session, coach: User, session_id: str) -> TrainingSession:
    s = db.get(TrainingSession, session_id)
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    _student(db, coach, s.user_id)  # 404 unless it's one of your students' sessions
    return s


@router.put("/sessions/{session_id}/note", response_model=SessionOut)
def set_note(session_id: str, body: NoteIn, coach: User = Depends(require_coach), db: Session = Depends(get_session)):
    """Add or change your note on a student's session. An empty note removes it."""
    s = _students_session(db, coach, session_id)
    text = body.text.strip()
    note = db.exec(select(SessionNote).where(SessionNote.session_id == s.id, SessionNote.coach_id == coach.id)).first()
    if not text:
        if note:
            db.delete(note)
    elif note:
        note.text = text
        note.updated_at = datetime.now(timezone.utc)
        db.add(note)
    else:
        db.add(SessionNote(session_id=s.id, coach_id=coach.id, text=text))
    db.commit()
    return sessions_out(db, [s])[0]


@router.delete("/sessions/{session_id}/note", response_model=SessionOut)
def delete_note(session_id: str, coach: User = Depends(require_coach), db: Session = Depends(get_session)):
    s = _students_session(db, coach, session_id)
    note = db.exec(select(SessionNote).where(SessionNote.session_id == s.id, SessionNote.coach_id == coach.id)).first()
    if note:
        db.delete(note)
        db.commit()
    return sessions_out(db, [s])[0]
