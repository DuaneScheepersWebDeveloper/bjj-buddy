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


# Formats OpenAI's speech-to-text accepts (by file extension).
SUPPORTED_EXTS = {"flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"}
# What some phones produce that OpenAI can't read.
UNSUPPORTED = {"amr": "AMR (an old phone format)", "caf": "CAF (Apple Core Audio)", "aac": "raw AAC (ADTS)"}


def detect_audio_type(data: bytes) -> Optional[str]:
    """Work out the audio format from the file's first bytes (one of SUPPORTED_EXTS or UNSUPPORTED)."""
    if len(data) < 12:
        return None
    if b"ftyp" in data[:64]:  # MP4 family: .m4a, .mp4, .3gp
        return "m4a"
    if data[:5] == b"#!AMR":
        return "amr"
    if data[:4] == b"caff":
        return "caf"
    if data[0] == 0xFF and (data[1] & 0xF6) == 0xF0:  # ADTS AAC frame header
        return "aac"
    if data[:4] == b"\x1aE\xdf\xa3":
        return "webm"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "wav"
    if data[:4] == b"OggS":
        return "ogg"
    if data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
        return "mp3"
    return None


class ModelNotFound(VoiceError):
    """OpenAI doesn't know (or doesn't give this key access to) the model name."""


# Tried in order if VOICE_TIDY_MODEL isn't available on your OpenAI account.
# Quick, non-"thinking" models first: tidying a few sentences shouldn't take long.
TIDY_FALLBACK_MODELS = ("gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1-nano", "gpt-6-luna", "gpt-5-mini")
# Give up on tidying after this long and return the word-for-word text instead.
TIDY_TIMEOUT_SECONDS = 20


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
        if e.code in (400, 404) and "model" in detail.lower():
            raise ModelNotFound("That AI model isn't available on this account.", 502)
        if e.code == 429 and ("insufficient_quota" in detail or "credit" in detail.lower()):
            raise VoiceError(
                "The OpenAI account has no credit left. Add some at platform.openai.com > Settings > Billing.", 503
            )
        if e.code == 429:
            raise VoiceError("The voice service is busy. Try again in a minute.", 503)
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
        timeout=60,
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
    global _working_tidy_model
    if not transcript.strip():
        return None
    messages = [
        {"role": "system", "content": TIDY_INSTRUCTIONS.format(topic=FIELD_HINT.get(field, "their session"), limit=limit)},
        {"role": "user", "content": transcript},
    ]
    candidates = [_working_tidy_model] if _working_tidy_model else [settings.voice_tidy_model, *TIDY_FALLBACK_MODELS]
    for model in dict.fromkeys(candidates):  # in order, no repeats
        if model in _slow_models:
            continue
        try:
            result = _request(
                "/chat/completions",
                body=json.dumps({"model": model, "messages": messages}).encode("utf-8"),
                content_type="application/json",
                timeout=TIDY_TIMEOUT_SECONDS,
            )
            text = result["choices"][0]["message"]["content"].strip()
            if model != settings.voice_tidy_model and _working_tidy_model is None:
                log.warning("VOICE_TIDY_MODEL %r isn't available or is too slow; using %r instead", settings.voice_tidy_model, model)
            _working_tidy_model = model  # remember it until the API restarts
            return text[:limit] or None
        except ModelNotFound:
            continue
        except VoiceError as e:
            if e.status == 503 and "reach" in str(e):  # timed out: too slow, skip it from now on
                _slow_models.add(model)
                if _working_tidy_model == model:
                    _working_tidy_model = None
                log.error("Tidy-up with %s took over %ss; returning the plain transcript", model, TIDY_TIMEOUT_SECONDS)
            else:
                log.error("Tidy-up failed, returning the plain transcript: %s", e)
            return None
        except (KeyError, IndexError, TypeError) as e:
            log.error("Tidy-up failed, returning the plain transcript: %s", e)
            return None
    log.error("None of the tidy-up models are available; returning the plain transcript")
    return None


_working_tidy_model: Optional[str] = None
_slow_models: set[str] = set()


def tidy_model_in_use() -> Optional[str]:
    return _working_tidy_model


# --- Voice dump: one recording -> a filled-in Quick Log --------------------------------

EXTRACT_INSTRUCTIONS = """You turn a Brazilian jiu-jitsu student's spoken recap of a training session into data for their training log.
Today is {today}. Their current focus (the one thing they're working on) is: {focus}.
People they've rolled with before: {partners}.

Reply with ONE JSON object and nothing else, using exactly these keys (use null or [] when they didn't say):
{{
  "went_right": short first-person notes on what went well ("• " bullets if several points), or null,
  "went_wrong": short first-person notes on what went badly or what they struggled with, or null,
  "adjustment": the ONE concrete thing they'll change or try next time (max 120 characters), or null,
  "worked_on_focus": true if they say they worked on their focus, false if they say they didn't, else null,
  "energy": 1-5 (1 = exhausted, gassed, wrecked; 3 = normal; 5 = felt great, sharp), or null,
  "duration_min": minutes trained as an integer, or null,
  "attire": "gi" or "nogi", or null,
  "session_type": "class", "open_mat", "private" or "competition", or null,
  "location": gym or place name, or null,
  "hits": [{{"name": technique, "category": c, "position": p, "count": n}}] = things THEY pulled off (subs, sweeps, passes, takedowns, escapes),
  "conceded": [same shape] = things done TO them (got submitted, swept, passed),
  "partners": [{{"name": name or null, "traits": [t...], "outcome": o or null}}]
}}
Rules:
- Technique names: use the exact name from this list when it matches what they said: {techniques}. Otherwise use a short standard name.
- category is one of submission, pass, sweep, escape, takedown, position. position is one of standing, top, bottom.
- traits only from: bigger, smaller, stronger, faster, flexible, higher_belt, lower_belt, same_belt.
- outcome only from: tapped_them (they submitted that partner), tapped_by (that partner submitted them), even.
- Never invent anything they didn't say. Keep their own words where you can, minus filler."""

_CATEGORIES = {"submission", "pass", "sweep", "escape", "takedown", "position"}
_POSITIONS = {"standing", "top", "bottom"}
_TRAITS = {"bigger", "smaller", "stronger", "faster", "flexible", "higher_belt", "lower_belt", "same_belt"}
_OUTCOMES = {"tapped_them", "tapped_by", "even"}


def _str(v, limit: int) -> Optional[str]:
    if not isinstance(v, str):
        return None
    v = v.strip()
    return v[:limit] or None


def _int(v, lo: int, hi: int) -> Optional[int]:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def _choice(v, allowed: tuple[str, ...]) -> Optional[str]:
    if not isinstance(v, str):
        return None
    v = v.strip().lower().replace("-", "").replace(" ", "_")
    v = {"no_gi": "nogi", "openmat": "open_mat"}.get(v, v)
    return v if v in allowed else None


def clean_extraction(raw: dict, library: dict[str, tuple[str, str, str]]) -> dict:
    """Keep only valid values from the model's answer, so the app never gets surprises.

    library: lower-case name -> (name, category, position), used to snap technique names
    to the library so they match the picker and the stats.
    """
    out: dict = {
        "went_right": _str(raw.get("went_right"), 2000),
        "went_wrong": _str(raw.get("went_wrong"), 2000),
        "adjustment": _str(raw.get("adjustment"), 300),
        "worked_on_focus": raw.get("worked_on_focus") if isinstance(raw.get("worked_on_focus"), bool) else None,
        "energy": _int(raw.get("energy"), 1, 5),
        "duration_min": _int(raw.get("duration_min"), 5, 600),
        "attire": _choice(raw.get("attire"), ("gi", "nogi")),
        "session_type": _choice(raw.get("session_type"), ("class", "open_mat", "private", "competition")),
        "location": _str(raw.get("location"), 80),
        "entries": [],
        "partners": [],
    }
    for key, result in (("hits", "hit"), ("conceded", "conceded")):
        for item in raw.get(key) or []:
            if not isinstance(item, dict):
                continue
            name = _str(item.get("name"), 60)
            if not name:
                continue
            known = library.get(name.lower())
            if known:
                name, category, position = known
            else:
                category = item.get("category") if item.get("category") in _CATEGORIES else "submission"
                position = item.get("position") if item.get("position") in _POSITIONS else "top"
            out["entries"].append(
                {"name": name, "category": category, "position": position, "result": result,
                 "count": _int(item.get("count"), 1, 50) or 1}
            )
    for item in (raw.get("partners") or [])[:20]:
        if not isinstance(item, dict):
            continue
        partner = {
            "name": _str(item.get("name"), 40),
            "traits": [t for t in dict.fromkeys(item.get("traits") or []) if t in _TRAITS],
            "outcome": item.get("outcome") if item.get("outcome") in _OUTCOMES else None,
        }
        if partner["name"] or partner["traits"] or partner["outcome"]:
            out["partners"].append(partner)
    return out


def extract_session(
    transcript: str,
    *,
    today: str,
    focus: Optional[str],
    partner_names: list[str],
    library: dict[str, tuple[str, str, str]],
) -> Optional[dict]:
    """Pull the Quick Log fields out of a spoken recap. None if it couldn't (the caller falls back)."""
    global _working_tidy_model
    if not transcript.strip():
        return None
    prompt = EXTRACT_INSTRUCTIONS.format(
        today=today,
        focus=f'"{focus}"' if focus else "none set",
        partners=", ".join(partner_names[:30]) or "none yet",
        techniques="; ".join(name for name, _, _ in library.values())[:4000],
    )
    messages = [{"role": "system", "content": prompt}, {"role": "user", "content": transcript}]
    candidates = [_working_tidy_model] if _working_tidy_model else [settings.voice_tidy_model, *TIDY_FALLBACK_MODELS]
    for model in dict.fromkeys(candidates):
        if model in _slow_models:
            continue
        try:
            result = _request(
                "/chat/completions",
                body=json.dumps(
                    {"model": model, "messages": messages, "response_format": {"type": "json_object"}}
                ).encode("utf-8"),
                content_type="application/json",
                timeout=TIDY_TIMEOUT_SECONDS + 10,  # a bit longer: it's doing more than tidying
            )
            raw = json.loads(result["choices"][0]["message"]["content"])
            _working_tidy_model = model
            return clean_extraction(raw if isinstance(raw, dict) else {}, library)
        except ModelNotFound:
            continue
        except (VoiceError, KeyError, IndexError, TypeError, ValueError) as e:
            log.error("Voice dump: couldn't pull out the details (%s); the app will use the transcript", e)
            return None
    return None
