from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session
from app.config import settings
from app.models.user_model import User
from app.models.session_model import Session as TrainingSession  # noqa: F401 (registers table)
from app.models.error_log_model import ErrorLog  # noqa: F401 (registers table)
from app.models.auth_token_model import AuthToken  # noqa: F401 (registers table)
from app.models.password_reset_model import PasswordResetCode  # noqa: F401 (registers table)
engine = create_engine(settings.database_url.replace("postgresql://", "postgresql+psycopg://"), echo=True)

def get_session():
    with Session(engine) as session:
        yield session

# create_all() only creates missing TABLES - it never adds new columns to a table
# that already exists. When you add a field to a model, add a line here so existing
# databases get the column too. (Later on, Alembic migrations can replace this.)
_ADD_MISSING_COLUMNS = [
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS belt_rank VARCHAR NOT NULL DEFAULT 'White'""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'user'""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS stripes INTEGER NOT NULL DEFAULT 0""",
]

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for statement in _ADD_MISSING_COLUMNS:
            conn.execute(text(statement))
