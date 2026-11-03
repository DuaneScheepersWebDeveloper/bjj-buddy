"""Voice notes: record what went right / wrong and get clear written notes back.

  GET  /voice/status  -> is it set up, and how long a recording can be
  POST /voice/notes   -> {audio_base64, field} -> {transcript, text}

See app/voice.py for how it works. Needs OPENAI_API_KEY in Backend/.env.
"""

import base64
import binascii
import time
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
    # The recording's file name on the phone (e.g. "recording-123.m4a"): a hint for the format.
    filename: Optional[str] = Field(default=None, max_length=200)
    # How long the phone says it recorded for, in milliseconds (for diagnostics).
    recorded_ms: Optional[int] = None


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


def _mime(audio_base64: str) -> Optional[str]:
    """The type in a data URL, e.g. "audio/mp4" from "data:audio/mp4;base64,..."."""
    head = audio_base64[:80]
    if head.startswith("data:") and ";" in head:
        return head[5 : head.index(";")] or None
    return None


def _ext_hint(audio_base64: str, filename: Optional[str]) -> Optional[str]:
    """Guess the format from the phone's file name or the data URL type, if it's one the service accepts."""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower().split("?")[0]
        ext = {"3gp": "mp4", "3gpp": "mp4", "mp4a": "m4a"}.get(ext, ext)
        if ext in voice.SUPPORTED_EXTS:
            return ext
    mime = (_mime(audio_base64) or "").lower()
    by_mime = {"audio/mp4": "m4a", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "video/mp4": "mp4", "audio/3gpp": "mp4",
               "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3"}
    return by_mime.get(mime.split(";")[0])


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
    started = time.perf_counter()
    audio = _decode(body.audio_base64)
    size_mb = len(audio) / (1024 * 1024)
    detected = voice.detect_audio_type(audio)
    hint = _ext_hint(body.audio_base64, body.filename)
    ext = detected if detected in voice.SUPPORTED_EXTS else (hint if detected is None else None)
    if ext is None:
        print(
            f"Voice note: format not recognised. First bytes: {audio[:16].hex(' ')} | size {len(audio)} bytes | "
            f"detected {detected or 'unknown'} | file name {body.filename or '?'} | {_mime(body.audio_base64) or 'no type'}",
            flush=True,
        )
        what = voice.UNSUPPORTED.get(detected or "", "a format the voice service can't read")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"This phone recorded in {what}. Please send the API terminal's 'Voice note' line to get it fixed.",
        )
    if len(audio) < 2000:
        print(
            f"Voice note: too small ({len(audio)} bytes, phone recorded {body.recorded_ms or '?'} ms). "
            f"First bytes: {audio[:16].hex(' ')} | file name {body.filename or '?'} | {_mime(body.audio_base64) or 'no type'}",
            flush=True,
        )
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That recording was too short. Try again and talk for a bit longer.")

    print(
        f"Voice note: received {size_mb:.2f} MB {ext}"
        f"{'' if detected else f' (guessed from the file name; first bytes {audio[:12].hex(chr(32))})'}, sending to OpenAI...",
        flush=True,
    )
    try:
        t0 = time.perf_counter()
        transcript = voice.transcribe(audio, ext, _vocabulary(db, user))
        t1 = time.perf_counter()
        if not transcript:
            raise voice.VoiceError("Didn't catch any words. Try again a little closer to the phone.", 422)
        tidied: Optional[str] = voice.tidy(transcript, body.field)
        t2 = time.perf_counter()
        # One line in the terminal per voice note, so slow steps are easy to spot.
        print(
            f"Voice note: {size_mb:.2f} MB {ext} | speech-to-text {t1 - t0:.1f}s | "
            f"tidy-up {t2 - t1:.1f}s ({voice.tidy_model_in_use() or 'no model, used word-for-word'}) | "
            f"total {t2 - started:.1f}s",
            flush=True,
        )
    except voice.VoiceError as e:
        print(f"Voice note FAILED after {time.perf_counter() - started:.1f}s: {e} (run `python -m app.voice_check` to test the connection)", flush=True)
        raise HTTPException(status_code=e.status, detail=str(e))
    finally:
        del audio  # never kept

    return VoiceNoteOut(transcript=transcript, text=tidied or transcript, tidied=tidied is not None)
