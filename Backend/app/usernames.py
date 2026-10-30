"""Username rules, shared by sign-up, admin edits and self edits.

A username is 3-30 characters: lowercase letters, numbers, dots and underscores,
starting with a letter or number. It's stored in lowercase, so "Duane_O" and
"duane_o" are the same username. It can't contain "@", which is how the login
form tells a username apart from an email address.
"""

import re
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from app.models.user_model import User

USERNAME_MIN = 3
USERNAME_MAX = 30
_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._]{%d,%d}$" % (USERNAME_MIN - 1, USERNAME_MAX - 1))
# Names people might use to impersonate staff or the app.
_RESERVED = {"admin", "administrator", "root", "support", "bjjbuddy", "bjj_buddy", "moderator", "staff"}


def clean_username(value: str) -> str:
    """Normalise and validate a username. Raises ValueError with a friendly message."""
    v = value.strip().lstrip("@").lower()
    if len(v) < USERNAME_MIN or len(v) > USERNAME_MAX:
        raise ValueError(f"Username must be {USERNAME_MIN}-{USERNAME_MAX} characters")
    if not _PATTERN.match(v):
        raise ValueError("Username can only use letters, numbers, dots and underscores, and must start with a letter or number")
    if ".." in v or v.endswith("."):
        raise ValueError("Username can't end with a dot or have two dots in a row")
    if v in _RESERVED:
        raise ValueError("That username isn't available")
    return v


def find_by_username(db: Session, username: str) -> Optional[User]:
    return db.exec(select(User).where(func.lower(User.username) == username.lower())).first()


def username_taken(db: Session, username: str, exclude_user_id: Optional[int] = None) -> bool:
    q = select(User).where(func.lower(User.username) == username.lower())
    if exclude_user_id is not None:
        q = q.where(User.id != exclude_user_id)
    return db.exec(q).first() is not None
