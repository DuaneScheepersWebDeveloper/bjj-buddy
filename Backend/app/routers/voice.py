"""Voice notes: record what went right / wrong and get clear written notes back.

  GET  /voice/status  -> is it set up, and how long a recording can be
  POST /voice/notes   -> {audio_base64, field} -> {transcript, text}

See app/voice.py for how it works. Needs OPENAI_API_KEY in Backend/.env.
"""

import base64
import binascii
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlmodel import Session, select

from app import voice
from app.database import get_session
from app.models.training_model import Technique
from app.models.user_model import User
from app.security import get_current_user

router = APIRouter(prefix="/voice", tags=["Voice notes"])


class VoiceStatus(BaseModel):
    enabled: bool
    max_seconds: int


class VoiceNoteIn(BaseModel):
    audio_base64: str = Field(min_length=16)
    field: Literal["went_right", "went_wrong", "to_improve"]


class VoiceNoteOut(BaseModel):
    transcript: str  # word for word
    text: str  # tidied up (or the transcript, if tidying wasn't possible)
    tidied: bool


@router.get("/status", response_model=VoiceStatus)
def voice_status(user: User = Depends(get_current_user)):
    return VoiceStatus(enabled=voice.enabled(), max_seconds=voice.max_seconds())


def _decode(audio_base64: str) -> bytes:
    text = audio_base64.strip()
    if text.startswith("data:"):  # "data:audio/m4a;base64,...."
        text = text.split(",", 1)[-1]
    if len(text) > voice.max_bytes() * 4 // 3 + 16:
        minutes = voice.max_seconds() // 60
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"That recording is too long. Keep voice notes under {minutes} minutes.",
        )
    try:
        return base64.b64decode(text, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That recording couldn't be read")


def _vocabulary(db: Session, user: User) -> list[str]:
    """Technique names to help the speech-to-text spell BJJ words. Shorter, distinctive names first."""
    names = db.exec(
        select(Technique.name).where(or_(Technique.user_id.is_(None), Technique.user_id == user.id))
    ).all()
    return sorted(set(names), key=len)[:60]


@router.post("/notes", response_model=VoiceNoteOut)
def voice_note(body: VoiceNoteIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    if not voice.enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice notes aren't set up yet. Add OPENAI_API_KEY to Backend/.env and restart the API.",
        )
    audio = _decode(body.audio_base64)
    ext = voice.detect_audio_type(audio)
    if ext is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That recording's format isn't supported")
    if len(audio) < 2000:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That recording was too short. Try again and talk for a bit longer.")

    try:
        transcript = voice.transcribe(audio, ext, _vocabulary(db, user))
        if not transcript:
            raise voice.VoiceError("Didn't catch any words. Try again a little closer to the phone.", 422)
        tidied: Optional[str] = voice.tidy(transcript, body.field)
    except voice.VoiceError as e:
        raise HTTPException(status_code=e.status, detail=str(e))
    finally:
        del audio  # never kept

    return VoiceNoteOut(transcript=transcript, text=tidied or transcript, tidied=tidied is not None)
