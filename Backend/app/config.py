from typing import Optional

from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str

    # --- Error logging ---
    # "development" | "staging" | "production" — stored on every error row.
    environment: str = "development"
    # Also log 4xx responses (bad input, not found, etc.) as WARNING rows.
    log_client_errors: bool = True
    # Key required in the X-Admin-Key header to read/resolve/purge errors via the API.
    # If left unset, those endpoints only work when environment == "development".
    admin_api_key: Optional[str] = None

    # --- Email (password reset codes) ---
    # "console" prints emails in the API terminal; "smtp" really sends them.
    # See app/email_sender.py for the Gmail settings.
    email_backend: str = "console"
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    email_from: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()
