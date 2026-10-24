from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import create_db_and_tables
from app.routers import users, sessions

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(
    title="BJJ Buddy API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(users.router) 
app.include_router(sessions.router) 
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "bjj-buddy-api"}