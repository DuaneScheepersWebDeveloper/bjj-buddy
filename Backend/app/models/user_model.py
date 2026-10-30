from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import date, datetime, timezone

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
    # Optional second way to sign in. Stored lowercase; unique (see database.py).
    username: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    belt_rank: str = Field(default="White")
    stripes: int = Field(default=0)  # 0-4 on the current belt
    role: str = Field(default=ROLE_USER)

    # --- Profile (all optional, edited by the user on the Profile page) ---
    gym: Optional[str] = Field(default=None)
    favourite_sub: Optional[str] = Field(default=None)
    birthday: Optional[date] = Field(default=None)
    country: Optional[str] = Field(default=None)
    # Path like /uploads/avatars/12-abc.jpg (served by the API), or None for no picture.
    avatar_url: Optional[str] = Field(default=None)

    @property
    def age(self) -> Optional[int]:
        """Worked out from the birthday, so it's always up to date."""
        if self.birthday is None:
            return None
        today = date.today()
        had_birthday = (today.month, today.day) >= (self.birthday.month, self.birthday.day)
        return today.year - self.birthday.year - (0 if had_birthday else 1)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
