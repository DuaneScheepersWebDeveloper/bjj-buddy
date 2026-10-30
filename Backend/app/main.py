from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import create_db_and_tables
from app.error_logging import setup_error_logging
from app.error_middleware import ErrorLoggingMiddleware, register_exception_handlers
from app.routers import admin, auth, users, sessions, errors

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    setup_error_logging()
    yield

app = FastAPI(
    title="BJJ Buddy API",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(errors.router)

# Error logging: records unhandled exceptions, HTTP errors and validation errors
# in the error_log table. Added before CORS so CORS stays the outermost layer
# and error responses still carry CORS headers.
register_exception_handlers(app)
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
