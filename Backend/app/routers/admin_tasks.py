"""The admins' shared Tasks list: a small to-do list for ideas.

Built to work with the app's offline outbox:
  - the phone picks each task's id, so offline edits can refer to tasks the server hasn't seen yet;
  - creating a task that already exists just returns it, and deleting a missing task succeeds,
    so replays after a dropped connection are harmless.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlmodel import Session, select

from app.database import get_session
from app.models.admin_task_model import AdminTask
from app.models.user_model import User
from app.security import require_admin

router = APIRouter(prefix="/admin/tasks", tags=["Admin tasks"], dependencies=[Depends(require_admin)])

_ID = re.compile(r"^[A-Za-z0-9-]{8,40}$")
MAX_TITLE = 200


def _clean_title(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("Type something for the task")
    if len(v) > MAX_TITLE:
        raise ValueError(f"Keep tasks under {MAX_TITLE} characters")
    return v


class TaskOut(BaseModel):
    id: str
    title: str
    done: bool
    created_at: datetime
    completed_at: Optional[datetime]
    created_by: Optional[int]
    created_by_name: Optional[str]


class TaskCreate(BaseModel):
    id: str
    title: str
    # When it was added on the phone (optional; defaults to now).
    created_at: Optional[datetime] = None

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not _ID.match(v):
            raise ValueError("Invalid task id")
        return v

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return _clean_title(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None)
    done: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _clean_title(v)


def _out(task: AdminTask, names: dict[int, str]) -> TaskOut:
    return TaskOut(
        id=task.id,
        title=task.title,
        done=task.done,
        created_at=task.created_at,
        completed_at=task.completed_at,
        created_by=task.created_by,
        created_by_name=names.get(task.created_by) if task.created_by else None,
    )


def _names(db: Session, tasks: list[AdminTask]) -> dict[int, str]:
    ids = {t.created_by for t in tasks if t.created_by}
    if not ids:
        return {}
    return {u.id: u.full_name for u in db.exec(select(User).where(User.id.in_(ids))).all()}


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_session)):
    """Open tasks first (newest first), then completed ones (most recently completed first)."""
    tasks = db.exec(select(AdminTask)).all()
    tasks.sort(key=lambda t: _as_utc(t.created_at), reverse=True)
    open_tasks = [t for t in tasks if not t.done]
    done = sorted(
        (t for t in tasks if t.done), key=lambda t: _as_utc(t.completed_at or t.created_at), reverse=True
    )
    names = _names(db, tasks)
    return [_out(t, names) for t in open_tasks + done]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, admin: User = Depends(require_admin), db: Session = Depends(get_session)):
    existing = db.get(AdminTask, body.id)
    if existing:  # replay of an earlier upload: nothing to do
        return _out(existing, _names(db, [existing]))
    now = datetime.now(timezone.utc)
    created = _as_utc(body.created_at) if body.created_at else now
    if created > now + timedelta(minutes=5):  # phone clock in the future
        created = now
    task = AdminTask(id=body.id, title=body.title, created_by=admin.id, created_at=created, updated_at=now)
    db.add(task)
    db.commit()
    db.refresh(task)
    return _out(task, _names(db, [task]))


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: str, body: TaskUpdate, db: Session = Depends(get_session)):
    task = db.get(AdminTask, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="That task was deleted")
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "title" in changes:
        task.title = changes["title"]
    if "done" in changes and changes["done"] != task.done:
        task.done = changes["done"]
        task.completed_at = datetime.now(timezone.utc) if task.done else None
    task.updated_at = datetime.now(timezone.utc)
    db.add(task)
    db.commit()
    db.refresh(task)
    return _out(task, _names(db, [task]))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, db: Session = Depends(get_session)):
    task = db.get(AdminTask, task_id)
    if task is not None:  # already gone counts as success
        db.delete(task)
        db.commit()
    return None
