"""Admin-only endpoints for managing users.

Every endpoint here needs a logged-in user whose role is "admin".
Make your first admin from the Backend folder with:

    python -m app.make_admin you@example.com
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlmodel import Session, select

from app.database import get_session
from app.models.auth_token_model import AuthToken
from app.models.password_reset_model import PasswordResetCode
from app.models.user_model import BELTS, MAX_STRIPES, ROLE_ADMIN, User
from app.schemas import UserPublic
from app.security import require_admin

router = APIRouter(prefix="/admin", tags=["Admin"], dependencies=[Depends(require_admin)])


class StatusUpdate(BaseModel):
    is_active: bool


class RoleUpdate(BaseModel):
    role: Literal["user", "admin"]


class AdminUserUpdate(BaseModel):
    """Fields an admin can change on someone's account. Send only what changes."""

    full_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[str] = None
    belt_rank: Optional[str] = None
    stripes: Optional[int] = Field(default=None, ge=0, le=MAX_STRIPES)
    role: Optional[Literal["user", "admin"]] = None
    is_active: Optional[bool] = None

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Name can't be empty")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1] or " " in v:
            raise ValueError("Enter a valid email address")
        return v

    @field_validator("belt_rank")
    @classmethod
    def _belt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip().capitalize()
        if v not in BELTS:
            raise ValueError(f"Belt must be one of: {', '.join(BELTS)}")
        return v


def _get_other_user(db: Session, user_id: int, admin: User, action: str) -> User:
    """Load a user an admin is about to change. Admins can't change themselves here,
    so nobody can accidentally lock themselves out."""
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"You can't {action} your own account")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _end_sessions(db: Session, user_id: int) -> None:
    """Log the user out everywhere and cancel any password reset in progress."""
    for token in db.exec(select(AuthToken).where(AuthToken.user_id == user_id)).all():
        db.delete(token)
    for code in db.exec(select(PasswordResetCode).where(PasswordResetCode.user_id == user_id)).all():
        db.delete(code)


@router.get("/users", response_model=list[UserPublic])
def list_users(
    search: Optional[str] = Query(default=None, description="Matches name or email"),
    active: Optional[bool] = Query(default=None, description="Only active (true) or inactive (false) users"),
    role: Optional[Literal["user", "admin"]] = None,
    db: Session = Depends(get_session),
):
    q = select(User)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        q = q.where(or_(func.lower(User.email).like(term), func.lower(User.full_name).like(term)))
    if active is not None:
        q = q.where(User.is_active == active)
    if role:
        q = q.where(User.role == role)
    return db.exec(q.order_by(User.full_name, User.id)).all()


@router.get("/users/{user_id}", response_model=UserPublic)
def get_user(user_id: int, db: Session = Depends(get_session)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserPublic)
def edit_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    """Edit someone's name, email, belt, stripes, role or active status.
    You can edit your own name, email and belt here, but not your own role or status."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if user.id == admin.id:
        if "role" in changes and changes["role"] != user.role:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't change your own role")
        if "is_active" in changes and changes["is_active"] != user.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account")

    if "email" in changes and changes["email"] != user.email:
        taken = db.exec(
            select(User).where(func.lower(User.email) == changes["email"], User.id != user.id)
        ).first()
        if taken:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Another account already uses that email")

    deactivating = changes.get("is_active") is False and user.is_active
    for key, value in changes.items():
        setattr(user, key, value)
    if deactivating:
        _end_sessions(db, user.id)

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserPublic)
def set_user_status(
    user_id: int,
    body: StatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    """Activate or deactivate a user. A deactivated user is logged out
    everywhere straight away and can't log in until reactivated."""
    user = _get_other_user(db, user_id, admin, "deactivate" if not body.is_active else "change")
    user.is_active = body.is_active
    if not body.is_active:
        _end_sessions(db, user.id)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/role", response_model=UserPublic)
def set_user_role(
    user_id: int,
    body: RoleUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    """Make someone an admin, or turn an admin back into a normal user."""
    user = _get_other_user(db, user_id, admin, "change the role of")
    user.role = body.role
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/summary")
def summary(db: Session = Depends(get_session)):
    """Quick counts for an admin dashboard."""
    total = db.exec(select(func.count()).select_from(User)).one()
    active = db.exec(select(func.count()).select_from(User).where(User.is_active == True)).one()  # noqa: E712
    admins = db.exec(select(func.count()).select_from(User).where(User.role == ROLE_ADMIN)).one()
    return {"total_users": total, "active_users": active, "inactive_users": total - active, "admins": admins}
