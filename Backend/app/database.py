from sqlmodel import SQLModel, create_engine, Session
from app.config import settings
from app.models.user_model import User
engine = create_engine(settings.database_url.replace("postgresql://", "postgresql+psycopg://"), echo=True)

def get_session():
    with Session(engine) as session:
        yield session

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)