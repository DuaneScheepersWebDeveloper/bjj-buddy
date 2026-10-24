# --- IMPORTS ---
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from app.database import get_session
from app.models.user_model import User
from pydantic import BaseModel
from typing import Optional

# Create a router instance. 
# prefix="/users" means every route here starts with /users
# tags=["Users"] groups them nicely in the Swagger /docs page
router = APIRouter(prefix="/users", tags=["Users"])

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

# --- ENDPOINTS (CRUD) ---

# 1. CREATE (POST)
# response_model=User ensures we don't accidentally send the password back
@router.post("/", response_model=User)
def create_user(user_data: UserCreate, session: Session = Depends(get_session)):
    # Check if a user with this email already exists in the database
    statement = select(User).where(User.email == user_data.email)
    existing_user = session.exec(statement).first()
    
    # If they exist, stop and send a 400 Bad Request error
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create the new user object
    # (Note: We are storing the password in plain text JUST for testing. We will hash it soon)
    new_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=user_data.password 
    )
    
    # Save to database
    session.add(new_user)
    session.commit()
    session.refresh(new_user) # Refresh so the DB-generated ID and created_at date are included
    
    return new_user


# 2. READ ALL (GET)
# We must put this BEFORE /{user_id} so it doesn't accidentally get caught by the ID route
@router.get("/", response_model=list[User])
def get_all_users(session: Session = Depends(get_session)):
    # Fetch every user from the database
    users = session.exec(select(User)).all()
    return users


# 3. READ ONE (GET by ID)
@router.get("/{user_id}", response_model=User)
def get_user(user_id: int, session: Session = Depends(get_session)):
    # Look for a specific user using their Primary Key (ID)
    user = session.get(User, user_id)
    
    # If no user was found, return a 404 Not Found error
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# 4. UPDATE (PATCH)
# PATCH is used for partial updates. PUT is used to replace the whole object.
@router.patch("/{user_id}", response_model=User)
def update_user(user_id: int, user_data: UserUpdate, session: Session = Depends(get_session)):
    # Find the user first
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # model_dump(exclude_unset=True) only returns the fields the user actually sent.
    # If they only sent "full_name", it won't overwrite their email with None.
    update_data = user_data.model_dump(exclude_unset=True)
    
    # If the user is updating their password, we map the plain "password" from the request
    # to the "hashed_password" column in the database.
    if "password" in update_data:
        update_data["hashed_password"] = update_data.pop("password")
        
    # Loop through the updated data and apply it to the user object
    for key, value in update_data.items():
        setattr(user, key, value)
        
    # Save changes
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


# 5. DELETE (DELETE)
# status_code=204 means "No Content", which is standard for a successful delete
@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Delete the user and commit
    session.delete(user)
    session.commit()
    return None