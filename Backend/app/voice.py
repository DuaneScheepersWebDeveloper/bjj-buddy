"""Voice notes: turn a recording into clear written notes.

Two steps, both using OpenAI's API (one key, OPENAI_API_KEY in .env):
  1. Speech to text: the recording becomes a word-for-word transcript. The BJJ technique
     names are passed as a hint so words like "D'Arce" and "omoplata" are spelled right.
  2. Tidy up: an AI model rewrites the transcript as clear, short notes in your own voice,
     without adding anything you didn't say. If this step fails, you still get the transcript.

The recording is only held in memory while this runs; it is never saved.
Uses only Python's standard library, so there's nothing extra to install.
"""

from __future__ import annotations

import json
import logging
import secrets
import urllib.error
import urllib.request
from typing import Optional

from app.config import settings

log = logging.getLogger("voice")

OPENAI_URL = "https://api.openai.com/v1"
# OpenAI's limit for one upload.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
# The longest recording the setting can allow (longer ones risk being cut off by the service).
HARD_MAX_SECONDS = 600

FIELD_HINT = {
    "went_right": "what went well in the session",
    "went_wrong": "what went badly in the session",
    "to_improve": "what they want to work on next",
}


class VoiceError(Exception):
    """A problem to show the user (message is friendly)."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def enabled() -> bool:
    return bool(settings.openai_api_key)


def max_seconds() -> int:
    return max(10, min(HARD_MAX_SECONDS, settings.voice_max_seconds))


def max_bytes() -> int:
    # Phones record speech at roughly 1 MB a minute (AAC, 128 kbps). Allow double for safety.
    return min(MAX_UPLOAD_BYTES, max_seconds() * 32 * 1024 + 512 * 1024)


def detect_audio_type(data: bytes) -> Optional[str]:
    """Work out the audio format from the file's first bytes."""
    if len(data) < 12:
        return None
    if data[4:8] == b"ftyp":
        return "m4a"
    if data[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:4] == b"OggS":
        return "ogg"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "mp3"
    return None


def _request(path: str, *, body: bytes, content_type: str, timeout: int) -> dict:
    req = urllib.request.Request(
        f"{OPENAI_URL}{path}",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:500]
        log.error("OpenAI %s failed: %s %s", path, e.code, detail)
        if e.code == 401:
            raise VoiceError("Voice notes aren't set up correctly (the API key was refused).", 503)
        if e.code == 429:
            raise VoiceError("The voice service is busy or out of credit. Try again in a minute.", 503)
        raise VoiceError("Couldn't turn that recording into text. Please try again.")
    except (urllib.error.URLError, TimeoutError) as e:
        log.error("OpenAI %s unreachable: %s", path, e)
        raise VoiceError("Couldn't reach the voice service. Please try again.", 503)


def transcribe(audio: bytes, ext: str, vocabulary: list[str]) -> str:
    """Speech to text, word for word."""
    boundary = f"----bjjbuddy{secrets.token_hex(12)}"
    hint = "BJJ (Brazilian jiu-jitsu) training notes. Terms: " + ", ".join(vocabulary)
    fields = {"model": settings.voice_transcribe_model, "prompt": hint[:900], "response_format": "json"}

    parts: list[bytes] = []
    for name, value in fields.items():
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
        )
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="note.{ext}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n".encode()
    )
    parts.append(audio)
    parts.append(f"\r\n--{boundary}--\r\n".encode())

    result = _request(
        "/audio/transcriptions",
        body=b"".join(parts),
        content_type=f"multipart/form-data; boundary={boundary}",
        timeout=120,
    )
    return " ".join(str(result.get("text") or "").split())


TIDY_INSTRUCTIONS = """You tidy up a Brazilian jiu-jitsu student's spoken training notes.
The text is a transcript of them talking about {topic}.

Rewrite it as clear, brief notes in their own voice (first person, "I").
- Keep every real point they made, in their order. Never add techniques, events or advice they didn't mention.
- Remove filler words, repeats and false starts.
- Fix the spelling of BJJ terms (e.g. D'Arce, omoplata, kimura, berimbolo, De La Riva).
- Use short sentences. If they made several separate points, put each on its own line starting with "• ".
- Keep it under {limit} characters.
Reply with the notes only: no title, no intro, no quotes."""


def tidy(transcript: str, field: str, limit: int = 1800) -> Optional[str]:
    """Rewrite the transcript as clear notes. Returns None if it couldn't (the caller falls back)."""
    if not transcript.strip():
        return None
    payload = {
        "model": settings.voice_tidy_model,
        "messages": [
            {"role": "system", "content": TIDY_INSTRUCTIONS.format(topic=FIELD_HINT.get(field, "their session"), limit=limit)},
            {"role": "user", "content": transcript},
        ],
    }
    try:
        result = _request(
            "/chat/completions",
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            timeout=60,
        )
        text = result["choices"][0]["message"]["content"].strip()
        return text[:limit] or None
    except (VoiceError, KeyError, IndexError, TypeError) as e:
        log.error("Tidy-up failed, returning the plain transcript: %s", e)
        return None
