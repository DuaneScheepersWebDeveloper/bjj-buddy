from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.avatars import UPLOAD_ROOT
from app.database import create_db_and_tables
from app.error_logging import setup_error_logging
from app.error_middleware import ErrorLoggingMiddleware, register_exception_handlers
from app.idempotency import IdempotencyMiddleware, purge_old_records
from app.routers import admin, admin_tasks, auth, coach, fitness, focus, users, sessions, voice, errors

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    setup_error_logging()
    purge_old_records()
    _report_voice_setup()
    yield


def _report_voice_setup():
    """Say in the terminal whether voice notes are on, without printing the secret key."""
    key = (settings.openai_api_key or "").strip()
    if not key:
        print("Voice notes: OFF. No OPENAI_API_KEY found in Backend/.env", flush=True)
        return
    problems = []
    if not key.startswith("sk-"):
        problems.append("it should start with 'sk-'")
    if len(key) < 100 and key.startswith("sk-proj-"):
        problems.append("it looks cut short (project keys are about 164 characters)")
    if any(c in key for c in " '\""):
        problems.append("it contains spaces or quotes")
    note = f" (check it: {'; '.join(problems)})" if problems else ""
    print(f"Voice notes: ON. Key {key[:8]}...{key[-4:]}, {len(key)} characters{note}", flush=True)

app = FastAPI(
    title="BJJ Buddy API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin_tasks.router)
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(coach.router)
app.include_router(fitness.router)
app.include_router(focus.router)
app.include_router(voice.router)
app.include_router(errors.router)

# Uploaded files (profile pictures) are served from Backend/uploads at /uploads/...
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

# Error logging: records unhandled exceptions, HTTP errors and validation errors
# in the error_log table. Added before CORS so CORS stays the outermost layer
# and error responses still carry CORS headers.
register_exception_handlers(app)
# Offline outbox retries: replay the saved answer instead of doing the work twice.
app.add_middleware(IdempotencyMiddleware)
app.add_middleware(ErrorLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "bjj-buddy-api"}
