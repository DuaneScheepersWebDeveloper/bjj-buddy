from sqlalchemy import text
from sqlmodel import SQLModel, create_engine, Session, select
from app.config import settings
from app.models.user_model import User
from app.models.training_model import SessionEntry, Technique, TrainingSession  # noqa: F401 (registers tables)
from app.models.error_log_model import ErrorLog  # noqa: F401 (registers table)
from app.models.auth_token_model import AuthToken  # noqa: F401 (registers table)
from app.models.password_reset_model import PasswordResetCode  # noqa: F401 (registers table)
from app.idempotency import IdempotencyRecord  # noqa: F401 (registers table)
from app.models.admin_task_model import AdminTask  # noqa: F401 (registers table)
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
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username VARCHAR""",
    # Usernames are unique (ignoring case). Users without one (NULL) don't clash.
    """CREATE UNIQUE INDEX IF NOT EXISTS ix_user_username_lower ON "user" (lower(username))""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS gym VARCHAR""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS favourite_sub VARCHAR""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS birthday DATE""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS country VARCHAR""",
    """ALTER TABLE "user" ADD COLUMN IF NOT EXISTS avatar_url VARCHAR""",
    # Built-in techniques have unique names; each user's own techniques are unique per user.
    """CREATE UNIQUE INDEX IF NOT EXISTS ix_technique_name_owner ON technique (lower(name), coalesce(user_id, 0))""",
    """CREATE INDEX IF NOT EXISTS ix_training_session_user_day ON training_session (user_id, trained_on DESC)""",
]

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for statement in _ADD_MISSING_COLUMNS:
            conn.execute(text(statement))
    seed_techniques()


def seed_techniques():
    """Add any built-in techniques (app/techniques_seed.py) that aren't in the table yet."""
    from app.techniques_seed import TECHNIQUES

    with Session(engine) as db:
        existing = {
            name.lower()
            for name in db.exec(select(Technique.name).where(Technique.user_id.is_(None))).all()
        }
        added = 0
        for name, category, position in TECHNIQUES:
            if name.lower() not in existing:
                db.add(Technique(name=name, category=category, position=position))
                existing.add(name.lower())
                added += 1
        if added:
            db.commit()
