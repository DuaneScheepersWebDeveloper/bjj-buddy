from fastapi import APIRouter, Depends
from sqlmodel import Session as DBSession, select
from app.database import get_session
from app.models.session_model import Session 
from pydantic import BaseModel

router = APIRouter(prefix="/sessions", tags=["Sessions"])

class SessionCreate(BaseModel):
    user_id: int
    gym_name: str
    duration_min: int
    notes: str | None = None

@router.post("/", response_model=Session)
def create_session(session_data: SessionCreate, db: DBSession = Depends(get_session)):
    new_session = Session(
        user_id=session_data.user_id,
        gym_name=session_data.gym_name,
        duration_min=session_data.duration_min,
        notes=session_data.notes
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

@router.get("/", response_model=list[Session])
def get_all_sessions(db: DBSession = Depends(get_session)):
    sessions = db.exec(select(Session)).all()
    return sessions