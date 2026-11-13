"""Fitness: your weight and how much water you drink. Everyone only sees their own.

Built for the app's offline outbox: each day is set with PUT (the phone sends the full value
for that day), so sending the same thing twice is harmless.

  GET    /fitness/weights?days=365     your weights, oldest first
  PUT    /fitness/weights/{day}        {weight_kg}   log or change that day's weight
  DELETE /fitness/weights/{day}
  GET    /fitness/water?days=30        water per day, oldest first
  PUT    /fitness/water/{day}          {ml}          that day's total (0 clears it)
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.database import get_session
from app.models.fitness_model import WaterLog, WeightEntry
from app.models.user_model import User
from app.security import get_current_user

router = APIRouter(prefix="/fitness", tags=["Fitness"])


class WeightIn(BaseModel):
    weight_kg: float = Field(ge=20, le=300)


class WeightOut(BaseModel):
    day: date
    weight_kg: float


class WaterIn(BaseModel):
    ml: int = Field(ge=0, le=10000)


class WaterOut(BaseModel):
    day: date
    ml: int


def _check_day(day: date) -> date:
    # +1 day: the phone may be a timezone ahead of the server.
    if day > date.today() + timedelta(days=1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="That date is in the future")
    if day < date(1990, 1, 1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Check the date")
    return day


# --- Weight ---------------------------------------------------------------------------


@router.get("/weights", response_model=list[WeightOut])
def list_weights(
    days: int = Query(default=365, ge=1, le=3650),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    since = date.today() - timedelta(days=days)
    rows = db.exec(
        select(WeightEntry).where(WeightEntry.user_id == user.id, WeightEntry.day >= since).order_by(WeightEntry.day)
    ).all()
    return [WeightOut(day=r.day, weight_kg=r.weight_kg) for r in rows]


@router.put("/weights/{day}", response_model=WeightOut)
def set_weight(day: date, body: WeightIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    _check_day(day)
    row = db.exec(select(WeightEntry).where(WeightEntry.user_id == user.id, WeightEntry.day == day)).first()
    weight = round(body.weight_kg, 1)
    if row is None:
        row = WeightEntry(user_id=user.id, day=day, weight_kg=weight)
    else:
        row.weight_kg = weight
        row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return WeightOut(day=row.day, weight_kg=row.weight_kg)


@router.delete("/weights/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_weight(day: date, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    row = db.exec(select(WeightEntry).where(WeightEntry.user_id == user.id, WeightEntry.day == day)).first()
    if row is not None:  # already gone counts as success
        db.delete(row)
        db.commit()
    return None


# --- Water ----------------------------------------------------------------------------


@router.get("/water", response_model=list[WaterOut])
def list_water(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    since = date.today() - timedelta(days=days)
    rows = db.exec(select(WaterLog).where(WaterLog.user_id == user.id, WaterLog.day >= since).order_by(WaterLog.day)).all()
    return [WaterOut(day=r.day, ml=r.ml) for r in rows]


@router.put("/water/{day}", response_model=WaterOut)
def set_water(day: date, body: WaterIn, user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    _check_day(day)
    row = db.exec(select(WaterLog).where(WaterLog.user_id == user.id, WaterLog.day == day)).first()
    if body.ml == 0:
        if row is not None:
            db.delete(row)
            db.commit()
        return WaterOut(day=day, ml=0)
    if row is None:
        row = WaterLog(user_id=user.id, day=day, ml=body.ml)
    else:
        row.ml = body.ml
        row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return WaterOut(day=row.day, ml=row.ml)
