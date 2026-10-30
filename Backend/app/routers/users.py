# --- IMPORTS ---
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models.user_model import User
from app.models.auth_token_model import AuthToken
from app.models.password_reset_model import PasswordResetCode
from app.models.session_model import Session as TrainingSession
from app.schemas import UserPublic
from app.security import get_current_user, hash_password, require_admin
from pydantic import BaseModel
from typing import Optional

# Create a router instance.
# prefix="/users" means every route here starts with /users
# tags=["Users"] groups them nicely in the Swagger /docs page
router = APIRouter(prefix="/users", tags=["Users"])

# Who can do what:
#   - Anyone logged in can read and update THEIR OWN account.
#   - Admins can read, create, update and delete ANY account.
#   - New people sign themselves up through POST /auth/register.
#   - Activating/deactivating and changing roles lives in /admin (admins only).

# --- PYDANTIC SCHEMAS (Data Validation) ---
# These classes define what the client is allowed to send us.

class UserCreate(BaseModel):
    """Schema for creating a new user"""
    email: str
    full_name: str
    password: str

class UserUpdate(BaseModel):
    """Schema for updating a user.
    We use Optional so the user can update just their name, or just their email,
    without having to send all the fields again."""
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None


def _load_user_for(user_id: int, current: User, session: Session) -> User:
    """Fetch a user, but only if it's you or you're an admin."""
    if user_id != current.id and not current.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access your own account")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# --- ENDPOINTS (CRUD) ---

# 1. CREATE (POST) - admins only
# response_model=UserPublic ensures we never send the password hash back
@router.post("/", response_model=UserPublic, dependencies=[Depends(require_admin)])
def create_user(user_data: UserCreate, session: Session = Depends(get_session)):
    # Check if a user with this email already exists in the database
    email = user_data.email.strip().lower()
    statement = select(User).where(User.email == email)
    existing_user = session.exec(statement).first()

    # If they exist, stop and send a 400 Bad Request error
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create the new user object (password is stored as a salted hash, never plain text)
    new_user = User(
        email=email,
        full_name=user_data.full_name,
        hashed_password=hash_password(user_data.password),
    )

    # Save to database
    session.add(new_user)
    session.commit()
    session.refresh(new_user) # Refresh so the DB-generated ID and created_at date are included

    return new_user


# 2. READ ALL (GET) - admins only
# We must put this BEFORE /{user_id} so it doesn't accidentally get caught by the ID route
@router.get("/", response_model=list[UserPublic], dependencies=[Depends(require_admin)])
def get_all_users(session: Session = Depends(get_session)):
    # Fetch every user from the database
    users = session.exec(select(User)).all()
    return users


# 3. READ ONE (GET by ID) - yourself, or anyone if you're an admin
@router.get("/{user_id}", response_model=UserPublic)
def get_user(user_id: int, current: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return _load_user_for(user_id, current, session)


# 4. UPDATE (PATCH) - yourself, or anyone if you're an admin
# PATCH is used for partial updates. PUT is used to replace the whole object.
@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    current: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user = _load_user_for(user_id, current, session)

    # model_dump(exclude_unset=True) only returns the fields the user actually sent.
    # If they only sent "full_name", it won't overwrite their email with None.
    update_data = user_data.model_dump(exclude_unset=True)

    # If the user is updating their password, we map the plain "password" from the request
    # to the "hashed_password" column in the database.
    if "password" in update_data:
        update_data["hashed_password"] = hash_password(update_data.pop("password"))
    if update_data.get("email"):
        update_data["email"] = update_data["email"].strip().lower()
        taken = session.exec(select(User).where(User.email == update_data["email"], User.id != user.id)).first()
        if taken:
            raise HTTPException(status_code=400, detail="Email already registered")

    # Loop through the updated data and apply it to the user object
    for key, value in update_data.items():
        setattr(user, key, value)

    # Save changes
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# 5. DELETE (DELETE) - admins only
# status_code=204 means "No Content", which is standard for a successful delete
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Don't throw away someone's training history by accident.
    if session.exec(select(TrainingSession).where(TrainingSession.user_id == user.id)).first():
        raise HTTPException(
            status_code=400,
            detail="This user has logged training sessions. Deactivate them instead of deleting.",
        )

    # Remove their login sessions first, then the user
    for token in session.exec(select(AuthToken).where(AuthToken.user_id == user.id)).all():
        session.delete(token)
    for code in session.exec(select(PasswordResetCode).where(PasswordResetCode.user_id == user.id)).all():
        session.delete(code)
    session.flush()
    session.delete(user)
    session.commit()
    return None
