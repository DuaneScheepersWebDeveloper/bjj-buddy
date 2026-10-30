from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserPublic(BaseModel):
    """What the API sends back about a user. Never includes the password hash."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    belt_rank: str
    stripes: int
    role: str
    is_active: bool
    created_at: datetime
