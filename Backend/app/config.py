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

    # --- Voice notes (record what went right / wrong, get clear text back) ---
    # Get a key at https://platform.openai.com/api-keys. Leave unset to turn voice notes off.
    openai_api_key: Optional[str] = None
    # Longest recording allowed, in seconds (up to 600 = 10 minutes).
    voice_max_seconds: int = 300
    # Speech-to-text model, and the model that tidies the text up. Change these if OpenAI renames them.
    voice_transcribe_model: str = "gpt-4o-mini-transcribe"
    voice_tidy_model: str = "gpt-4.1-mini"

    class Config:
        env_file = ".env"

settings = Settings()
