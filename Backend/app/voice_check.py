"""Test the connection from this PC to OpenAI, step by step, for voice notes.

Run it from the Backend folder (with the virtual environment active):

    python -m app.voice_check

It never prints your full API key. Each step says how long it took, so you can see
where things are slow or blocked.
"""

from __future__ import annotations

import io
import json
import math
import socket
import ssl
import struct
import time
import urllib.error
import urllib.request
import wave

from app.config import settings
from app import voice

HOST = "api.openai.com"


def step(name: str):
    print(f"\n{name}...", flush=True)
    return time.perf_counter()


def done(t0: float, message: str):
    print(f"   {message}  ({time.perf_counter() - t0:.1f}s)", flush=True)


def tone_wav(seconds: float = 1.5) -> bytes:
    """A short beep as a WAV file (no microphone needed)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        frames = b"".join(
            struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / 16000))) for i in range(int(16000 * seconds))
        )
        w.writeframes(frames)
    return buf.getvalue()


def main() -> None:
    print("Voice notes connection check")
    print("=" * 30)

    key = (settings.openai_api_key or "").strip()
    if not key:
        print("\nNo OPENAI_API_KEY in Backend/.env. Add it and run this again.")
        return
    print(f"\nKey found: {key[:8]}...{key[-4:]} ({len(key)} characters)")

    proxy = urllib.request.getproxies().get("https") or urllib.request.getproxies().get("http")
    if proxy:
        print(f"Note: this PC sends web traffic through a proxy ({proxy}). That can slow down or block OpenAI.")

    t0 = step("1. Looking up api.openai.com")
    try:
        addrs = {a[4][0] for a in socket.getaddrinfo(HOST, 443, proto=socket.IPPROTO_TCP)}
        done(t0, f"OK: {', '.join(sorted(addrs)[:3])}")
    except OSError as e:
        done(t0, f"FAILED: {e}. This PC can't find OpenAI (DNS / internet problem).")
        return

    t0 = step("2. Connecting securely")
    try:
        with socket.create_connection((HOST, 443), timeout=15) as raw:
            with ssl.create_default_context().wrap_socket(raw, server_hostname=HOST):
                pass
        done(t0, "OK")
    except OSError as e:
        done(t0, f"FAILED: {e}. Something (firewall, antivirus, VPN) is blocking the connection.")
        return

    t0 = step("3. Checking the key")
    req = urllib.request.Request(f"https://{HOST}/v1/models", headers={"Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            models = {m["id"] for m in json.loads(res.read())["data"]}
        done(t0, "OK: the key works")
        for m in (settings.voice_transcribe_model, settings.voice_tidy_model):
            print(f"   {m}: {'available' if m in models else 'NOT available on this account'}")
    except urllib.error.HTTPError as e:
        hint = {401: "the key is wrong or was deleted", 429: "no credit, or too many requests"}.get(e.code, "")
        done(t0, f"FAILED: HTTP {e.code} {hint}")
        return
    except (urllib.error.URLError, TimeoutError) as e:
        done(t0, f"FAILED: {e}")
        return

    t0 = step("4. Speech to text (a 1.5 second test beep)")
    try:
        text = voice.transcribe(tone_wav(), "wav", [])
        done(t0, f"OK (heard: {text!r})")
    except voice.VoiceError as e:
        done(t0, f"FAILED: {e}")
        return

    t0 = step("5. Tidy-up")
    out = voice.tidy("um so like I hit a triangle in the second round and uh got the knee slice", "went_right")
    if out:
        done(t0, f"OK with {voice.tidy_model_in_use()}: {out!r}")
    else:
        done(t0, "Didn't work, so voice notes would fall back to word-for-word text")

    print("\nAll done. If every step says OK and took a few seconds at most, voice notes should be quick.")


if __name__ == "__main__":
    main()
