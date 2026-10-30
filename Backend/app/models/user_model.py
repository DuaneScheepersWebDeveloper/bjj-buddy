from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone

# The two kinds of user. Admins can manage other users (and more, later on).
ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLES = (ROLE_USER, ROLE_ADMIN)

# Adult belt ranks, lowest to highest.
BELTS = ("White", "Blue", "Purple", "Brown", "Black")
# Stripes awarded on the current belt (0 = none yet).
MAX_STRIPES = 4


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    full_name: str
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    belt_rank: str = Field(default="White")
    stripes: int = Field(default=0)  # 0-4 on the current belt
    role: str = Field(default=ROLE_USER)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
