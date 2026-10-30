"""Profile pictures: checking, saving and deleting the image files.

Pictures are saved in Backend/uploads/avatars/ and served by the API at
/uploads/avatars/<file>. Each upload gets a new random file name, so phones
never show an old cached picture after you change it.
"""

from __future__ import annotations

import base64
import binascii
import secrets
from pathlib import Path
from typing import Optional

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
AVATAR_DIR = UPLOAD_ROOT / "avatars"
URL_PREFIX = "/uploads/avatars/"
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _detect_type(data: bytes) -> Optional[str]:
    """Work out the real image type from the file's first bytes (not what the client claims)."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def decode_image(image_base64: str) -> tuple[bytes, str]:
    """Turn the app's base64 text into image bytes. Raises ValueError with a friendly message."""
    text = image_base64.strip()
    if text.startswith("data:"):  # "data:image/jpeg;base64,...."
        text = text.split(",", 1)[-1]
    if len(text) > MAX_BYTES * 4 // 3 + 16:
        raise ValueError("That picture is too big. Please choose one under 5 MB.")
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("That picture couldn't be read. Please try another one.")
    if len(data) > MAX_BYTES:
        raise ValueError("That picture is too big. Please choose one under 5 MB.")
    ext = _detect_type(data)
    if ext is None:
        raise ValueError("Please choose a JPG, PNG or WebP picture.")
    return data, ext


def save_avatar(user_id: int, data: bytes, ext: str) -> str:
    """Write the file and return the URL path to store on the user."""
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{user_id}-{secrets.token_urlsafe(12)}.{ext}"
    (AVATAR_DIR / name).write_bytes(data)
    return URL_PREFIX + name


def delete_avatar_file(url: Optional[str]) -> None:
    """Remove an old picture's file (ignores anything that isn't one of ours)."""
    if not url or not url.startswith(URL_PREFIX):
        return
    name = url[len(URL_PREFIX):]
    if "/" in name or "\\" in name or ".." in name:
        return
    try:
        (AVATAR_DIR / name).unlink(missing_ok=True)
    except OSError:
        pass
