"""Password hashing and login-token helpers.

Uses only the Python standard library (hashlib.scrypt), so nothing new to install.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.database import get_session
from app.models.auth_token_model import AuthToken
from app.models.user_model import User

# How long a login lasts before the user has to sign in again.
TOKEN_LIFETIME = timedelta(days=30)

# --- Password hashing -------------------------------------------------------

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P, _SCRYPT_LEN = 2**14, 8, 1, 64
_PREFIX = "scrypt"


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def hash_password(password: str) -> str:
    """Return a salted scrypt hash like 'scrypt$16384$8$1$<salt>$<hash>'."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=_SCRYPT_LEN
    )
    return f"{_PREFIX}${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def is_hashed(stored: str) -> bool:
    return stored.startswith(_PREFIX + "$")


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash.

    Users created before login existed have their password saved as plain text.
    Those still verify here; the login endpoint then upgrades them to a hash.
    """
    if not is_hashed(stored):
        return hmac.compare_digest(password.encode("utf-8"), stored.encode("utf-8"))
    try:
        _, n, r, p, salt_b64, hash_b64 = stored.split("$")
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt_b64),
            n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)


# A real hash to check against when the email doesn't exist, so a wrong email
# takes as long as a wrong password (stops attackers discovering which emails exist).
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def burn_time_verifying(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


# --- Login tokens -----------------------------------------------------------

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(db: Session, user: User, user_agent: Optional[str] = None) -> tuple[str, datetime]:
    """Create a login session for the user and return (raw_token, expires_at)."""
    raw = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + TOKEN_LIFETIME
    db.add(AuthToken(
        user_id=user.id,
        token_hash=hash_token(raw),
        expires_at=expires_at,
        user_agent=(user_agent or "")[:255] or None,
    ))
    db.commit()
    return raw, expires_at


def _as_utc(dt: datetime) -> datetime:
    # Some databases hand datetimes back without a timezone; treat them as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# auto_error=False so we can return our own clear 401 message.
bearer_scheme = HTTPBearer(auto_error=False, description="Paste the access_token from POST /auth/login")

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not logged in or session expired",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_session),
) -> AuthToken:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _UNAUTHORIZED
    token = db.exec(select(AuthToken).where(AuthToken.token_hash == hash_token(credentials.credentials))).first()
    if token is None:
        raise _UNAUTHORIZED
    if _as_utc(token.expires_at) <= datetime.now(timezone.utc):
        db.delete(token)
        db.commit()
        raise _UNAUTHORIZED
    return token


def get_current_user(
    token: AuthToken = Depends(get_current_token),
    db: Session = Depends(get_session),
) -> User:
    """Use as a dependency on any endpoint that needs a logged-in user:

        def my_endpoint(user: User = Depends(get_current_user)): ...
    """
    user = db.get(User, token.user_id)
    if user is None or not user.is_active:
        raise _UNAUTHORIZED
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Use as a dependency on endpoints only admins may call:

        def admin_thing(admin: User = Depends(require_admin)): ...
    """
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can do this")
    return user
