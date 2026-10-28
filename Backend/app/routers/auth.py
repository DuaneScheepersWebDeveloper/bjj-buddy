"""Login, logout, sign-up and "who am I" endpoints.

Flow for the app:
  1. POST /auth/login  {email, password}     -> {access_token, user, ...}
  2. Send the token on every request:  Authorization: Bearer <access_token>
  3. GET  /auth/me                           -> the logged-in user
  4. POST /auth/logout                       -> ends this session (token stops working)

Forgot password:
  1. POST /auth/forgot-password {email}                        -> emails a 6-digit code
  2. POST /auth/reset-password  {email, code, new_password}    -> sets the password and logs in
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select

from app.config import settings
from app.database import get_session
from app.email_sender import send_email
from app.models.auth_token_model import AuthToken
from app.models.password_reset_model import PasswordResetCode
from app.models.user_model import User
from app.schemas import UserPublic
from app.security import (
    _as_utc,
    burn_time_verifying,
    get_current_token,
    get_current_user,
    hash_password,
    is_hashed,
    issue_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
log = logging.getLogger("auth")

MIN_PASSWORD_LENGTH = 8


def _clean_email(value: str) -> str:
    value = value.strip().lower()
    if "@" not in value or "." not in value.split("@")[-1] or " " in value:
        raise ValueError("Enter a valid email address")
    return value


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _clean_email(v)


class RegisterRequest(BaseModel):
    email: str
    full_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _clean_email(v)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Enter your name")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserPublic


def _find_user(db: Session, email: str) -> Optional[User]:
    # Case-insensitive so "Me@Gym.com" and "me@gym.com" are the same account,
    # including accounts created before emails were lower-cased.
    return db.exec(select(User).where(func.lower(User.email) == email)).first()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_session)):
    user = _find_user(db, body.email)
    if user is None:
        burn_time_verifying(body.password)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")

    # Older accounts stored the password as plain text: upgrade to a hash now.
    if not is_hashed(user.hashed_password):
        user.hashed_password = hash_password(body.password)
        db.add(user)
        db.commit()
        db.refresh(user)

    token, expires_at = issue_token(db, user, request.headers.get("user-agent"))
    return TokenResponse(access_token=token, expires_at=expires_at, user=UserPublic.model_validate(user))


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_session)):
    if _find_user(db, body.email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An account with this email already exists")
    user = User(email=body.email, full_name=body.full_name, hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    token, expires_at = issue_token(db, user, request.headers.get("user-agent"))
    return TokenResponse(access_token=token, expires_at=expires_at, user=UserPublic.model_validate(user))


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: AuthToken = Depends(get_current_token), db: Session = Depends(get_session)):
    """Log out of this device only."""
    db.delete(token)
    db.commit()
    return None


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    """Log out of every device."""
    for token in db.exec(select(AuthToken).where(AuthToken.user_id == user.id)).all():
        db.delete(token)
    db.commit()
    return None


# --- Forgot / reset password ------------------------------------------------

RESET_CODE_LIFETIME = timedelta(minutes=15)
RESET_RESEND_COOLDOWN = timedelta(seconds=60)
RESET_MAX_ATTEMPTS = 5

# Same reply whether or not the email has an account, so nobody can use this
# endpoint to find out who uses the app.
_RESET_SENT = {"detail": "If an account exists for that email, we've sent a reset code."}


def _hash_reset_code(user_id: int, code: str) -> str:
    # Keyed with SECRET_KEY: a 6-digit code is easy to brute-force from a plain hash.
    return hmac.new(settings.secret_key.encode(), f"{user_id}:{code}".encode(), hashlib.sha256).hexdigest()


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _clean_email(v)


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=200)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _clean_email(v)

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        v = "".join(v.split())
        if len(v) != 6 or not v.isdigit():
            raise ValueError("Enter the 6-digit code from the email")
        return v


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_session)):
    user = _find_user(db, body.email)
    if user is None or not user.is_active:
        return _RESET_SENT

    now = datetime.now(timezone.utc)
    existing = db.exec(select(PasswordResetCode).where(PasswordResetCode.user_id == user.id)).first()
    if existing and _as_utc(existing.created_at) > now - RESET_RESEND_COOLDOWN:
        return _RESET_SENT  # a code was sent less than a minute ago; don't spam their inbox
    if existing:
        db.delete(existing)
        db.flush()

    code = f"{secrets.randbelow(1_000_000):06d}"
    reset = PasswordResetCode(
        user_id=user.id,
        code_hash=_hash_reset_code(user.id, code),
        created_at=now,
        expires_at=now + RESET_CODE_LIFETIME,
    )
    db.add(reset)
    db.commit()

    minutes = int(RESET_CODE_LIFETIME.total_seconds() // 60)
    try:
        send_email(
            to=user.email,
            subject=f"Your BJJ Buddy reset code: {code}",
            body=(
                f"Hi {user.full_name},\n\n"
                f"Your BJJ Buddy password reset code is:\n\n    {code}\n\n"
                f"It expires in {minutes} minutes. If you didn't ask to reset your password, "
                f"you can ignore this email - your password won't change.\n\nOss!\n"
            ),
        )
    except Exception:
        log.exception("Could not send password reset email to user %s", user.id)
        db.delete(reset)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We couldn't send the email right now. Please try again in a few minutes.",
        )
    return _RESET_SENT


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(body: ResetPasswordRequest, request: Request, db: Session = Depends(get_session)):
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="That code is incorrect or has expired. Check the email or request a new code.",
    )
    user = _find_user(db, body.email)
    reset = None
    if user is not None:
        reset = db.exec(select(PasswordResetCode).where(PasswordResetCode.user_id == user.id)).first()
    if user is None or reset is None:
        raise invalid

    if _as_utc(reset.expires_at) <= datetime.now(timezone.utc) or reset.attempts >= RESET_MAX_ATTEMPTS:
        db.delete(reset)
        db.commit()
        raise invalid

    if not hmac.compare_digest(reset.code_hash, _hash_reset_code(user.id, body.code)):
        reset.attempts += 1
        if reset.attempts >= RESET_MAX_ATTEMPTS:
            db.delete(reset)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many wrong attempts. Please request a new code.",
            )
        db.add(reset)
        db.commit()
        raise invalid

    # Code is good: set the new password, use up the code, and log out every
    # other device (in case someone else had access to the account).
    user.hashed_password = hash_password(body.new_password)
    db.add(user)
    db.delete(reset)
    for token in db.exec(select(AuthToken).where(AuthToken.user_id == user.id)).all():
        db.delete(token)
    db.commit()
    db.refresh(user)

    token, expires_at = issue_token(db, user, request.headers.get("user-agent"))
    return TokenResponse(access_token=token, expires_at=expires_at, user=UserPublic.model_validate(user))
