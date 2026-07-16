from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc, delete
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, timezone

from app.db.base import get_db
from app.db.models import (
    OperatorShift, OperatorMonthlyStats, User, UserRole,
    Application, Customer, ApplicationLayout, ApplicationLayoutPart,
    ScheduleOverride
)
from app.core.deps import get_current_user, get_customer_ids

router = APIRouter(prefix="/audit", tags=["Audit"])


class ShiftCreate(BaseModel):
    user_id: int
    date: str
    shift_type: str = "day"
    hours: float = 8.0
    machine_type: Optional[str] = None


class ShiftUpdate(BaseModel):
    hours: Optional[float] = None
    shift_type: Optional[str] = None
    machine_type: Optional[str] = None


@router.get("/operators")
async def list_operator_shifts(
        month: str = Query(..., description="YYYY-MM"),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    year, mon = map(int, month.split("-"))
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)

    result = await db.execute(
        select(OperatorShift, User.username)
        .join(User, OperatorShift.user_id == User.id, isouter=True)
        .where(and_(OperatorShift.date >= start, OperatorShift.date < end))
        .order_by(OperatorShift.date)
    )
    rows = result.all()

    return [
        {
            "id": s.id,
            "user_id": s.user_id,
            "username": username,
            "date": s.date.isoformat() if s.date else None,
            "shift_type": s.shift_type,
            "hours": s.hours,
            "machine_type": s.machine_type,
        }
        for s, username in rows
    ]


@router.post("/operators")
async def create_shift(
        data: ShiftCreate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    shift = OperatorShift(
        user_id=data.user_id,
        date=datetime.fromisoformat(data.date),
        shift_type=data.shift_type,
        hours=data.hours,
        machine_type=data.machine_type,
    )
    db.add(shift)
    await db.commit()
    await db.refresh(shift)

    return {"id": shift.id, "status": "success"}


@router.put("/operators/{shift_id}")
async def update_shift(
        shift_id: int,
        data: ShiftUpdate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    result = await db.execute(select(OperatorShift).where(OperatorShift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    if data.hours is not None:
        shift.hours = data.hours
    if data.shift_type is not None:
        shift.shift_type = data.shift_type
    if data.machine_type is not None:
        shift.machine_type = data.machine_type

    await db.commit()
    return {"status": "success"}


@router.delete("/operators/{shift_id}")
async def delete_shift(
        shift_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    result = await db.execute(select(OperatorShift).where(OperatorShift.id == shift_id))
    shift = result.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    await db.delete(shift)
    await db.commit()
    return {"status": "success"}


class SyncShiftItem(BaseModel):
    username: str
    date: str
    shift_type: str = "day"
    hours: float = 12.0
    machine_type: Optional[str] = None


class SyncShiftsRequest(BaseModel):
    month: str
    shifts: list[SyncShiftItem]


@router.post("/operators/sync")
async def sync_shifts(
        data: SyncShiftsRequest,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    year, mon = map(int, data.month.split("-"))
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)

    await db.execute(
        delete(OperatorShift).where(
            and_(OperatorShift.date >= start, OperatorShift.date < end)
        )
    )

    usernames = list(set(s.username for s in data.shifts))
    result = await db.execute(
        select(User).where(User.username.in_(usernames))
    )
    users_by_name = {u.username: u.id for u in result.scalars().all()}

    created = 0
    for item in data.shifts:
        user_id = users_by_name.get(item.username)
        if not user_id:
            continue
        shift = OperatorShift(
            user_id=user_id,
            date=datetime.fromisoformat(item.date),
            shift_type=item.shift_type,
            hours=item.hours,
            machine_type=item.machine_type,
        )
        db.add(shift)
        created += 1

    await db.commit()

    try:
        from app.main import manager
        await manager.broadcast({
            "type": "notification",
            "message": f"График смен обновлён на {data.month}"
        })
    except Exception:
        pass

    return {"status": "success", "created": created}


class MonthlyStatsUpdate(BaseModel):
    user_id: int
    month: str
    planned_hours: Optional[float] = None
    sick_hours: Optional[float] = None
    vacation_hours: Optional[float] = None
    overtime_hours: Optional[float] = None
    hourly_rate: Optional[float] = None


@router.get("/operators/stats")
async def get_monthly_stats(
        month: str = Query(..., description="YYYY-MM"),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    result = await db.execute(
        select(OperatorMonthlyStats, User.username)
        .join(User, OperatorMonthlyStats.user_id == User.id, isouter=True)
        .where(OperatorMonthlyStats.month == month)
    )
    rows = result.all()

    return [
        {
            "id": s.id,
            "user_id": s.user_id,
            "username": username,
            "month": s.month,
            "planned_hours": s.planned_hours,
            "sick_hours": s.sick_hours,
            "vacation_hours": s.vacation_hours,
            "overtime_hours": s.overtime_hours,
            "hourly_rate": s.hourly_rate,
        }
        for s, username in rows
    ]


@router.post("/operators/stats")
async def upsert_monthly_stats(
        data: MonthlyStatsUpdate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    result = await db.execute(
        select(OperatorMonthlyStats).where(
            and_(
                OperatorMonthlyStats.user_id == data.user_id,
                OperatorMonthlyStats.month == data.month,
            )
        )
    )
    stats = result.scalar_one_or_none()

    if stats:
        if data.planned_hours is not None:
            stats.planned_hours = data.planned_hours
        if data.sick_hours is not None:
            stats.sick_hours = data.sick_hours
        if data.vacation_hours is not None:
            stats.vacation_hours = data.vacation_hours
        if data.overtime_hours is not None:
            stats.overtime_hours = data.overtime_hours
        if data.hourly_rate is not None:
            stats.hourly_rate = data.hourly_rate
    else:
        stats = OperatorMonthlyStats(
            user_id=data.user_id,
            month=data.month,
            planned_hours=data.planned_hours or 0.0,
            sick_hours=data.sick_hours or 0.0,
            vacation_hours=data.vacation_hours or 0.0,
            overtime_hours=data.overtime_hours or 0.0,
            hourly_rate=data.hourly_rate or 0.0,
        )
        db.add(stats)

    await db.commit()
    await db.refresh(stats)
    return {"id": stats.id, "status": "success"}


@router.get("/operators/users")
async def list_operators(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(User).where(User.role.in_([UserRole.OPERATOR, UserRole.ADMIN]))
        .order_by(User.username)
    )
    users = result.scalars().all()
    return [{"id": u.id, "username": u.username} for u in users]


class OverrideCreate(BaseModel):
    date: str
    st1: Optional[str] = None
    st2: Optional[str] = None
    night: Optional[str] = None
    st1_hours: Optional[float] = None
    st2_hours: Optional[float] = None
    night_hours: Optional[float] = None


@router.get("/overrides")
async def list_overrides(
        month: str = Query(..., description="YYYY-MM"),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    year, mon = map(int, month.split("-"))
    start = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)

    result = await db.execute(
        select(ScheduleOverride).where(
            and_(ScheduleOverride.date >= start, ScheduleOverride.date < end)
        ).order_by(ScheduleOverride.date)
    )
    rows = result.scalars().all()

    overrides = {}
    for r in rows:
        key = r.date.strftime("%Y-%m-%d")
        overrides[key] = {"st1": r.st1, "st2": r.st2, "night": r.night, "st1_hours": r.st1_hours, "st2_hours": r.st2_hours, "night_hours": r.night_hours}
    return overrides


@router.post("/overrides")
async def upsert_override(
        data: OverrideCreate,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    dt = datetime.fromisoformat(data.date)
    has_any = data.st1 or data.st2 or data.night

    result = await db.execute(
        select(ScheduleOverride).where(ScheduleOverride.date == dt)
    )
    existing = result.scalar_one_or_none()

    if not has_any:
        if existing:
            await db.delete(existing)
            await db.commit()
        return {"status": "deleted"}

    if existing:
        existing.st1 = data.st1
        existing.st2 = data.st2
        existing.night = data.night
        existing.st1_hours = data.st1_hours
        existing.st2_hours = data.st2_hours
        existing.night_hours = data.night_hours
    else:
        override = ScheduleOverride(date=dt, st1=data.st1, st2=data.st2, night=data.night, st1_hours=data.st1_hours, st2_hours=data.st2_hours, night_hours=data.night_hours)
        db.add(override)

    await db.commit()

    try:
        from app.main import manager
        await manager.broadcast({
            "type": "notification",
            "message": f"Смена на {date} изменена"
        })
    except Exception:
        pass

    return {"status": "success"}


@router.delete("/overrides/{date}")
async def delete_override(
        date: str,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет доступа")

    dt = datetime.fromisoformat(date)
    result = await db.execute(
        select(ScheduleOverride).where(ScheduleOverride.date == dt)
    )
    existing = result.scalar_one_or_none()
    if existing:
        await db.delete(existing)
        await db.commit()

        try:
            from app.main import manager
            await manager.broadcast({
                "type": "notification",
                "message": f"Смена на {date} сброшена"
            })
        except Exception:
            pass

    return {"status": "success"}


@router.get("/applications")
async def audit_applications(
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        customer_id: Optional[int] = None,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    query = (
        select(Application, Customer)
        .join(Customer, Application.customer_id == Customer.id, isouter=True)
        .where(~Application.order_name.like("Слияние%"))
        .order_by(Application.created_at.desc())
    )

    if date_from:
        query = query.where(Application.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.where(Application.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))
    if customer_id:
        query = query.where(Application.customer_id == customer_id)

    # Filter by customer-role user assigned customers
    audit_cust_ids = await get_customer_ids(user, db)
    if audit_cust_ids is not None:
        if not audit_cust_ids:
            return []
        query = query.where(Application.customer_id.in_(audit_cust_ids))

    result = await db.execute(query)
    rows = result.all()

    app_ids = [app.id for app, _ in rows]

    layouts_result = await db.execute(
        select(ApplicationLayout).where(
            ApplicationLayout.application_id.in_(app_ids),
            ApplicationLayout.status.in_(["active", None])
        )
    )
    all_layouts = layouts_result.scalars().all()

    layout_ids = [l.id for l in all_layouts]
    parts_result = await db.execute(
        select(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id.in_(layout_ids))
    )
    all_parts = parts_result.scalars().all()

    layouts_by_app = {}
    for layout in all_layouts:
        layouts_by_app.setdefault(layout.application_id, []).append(layout)

    parts_by_layout = {}
    for part in all_parts:
        parts_by_layout.setdefault(part.layout_id, []).append(part)

    enriched = []
    for app, cust in rows:
        layouts = layouts_by_app.get(app.id, [])

        total_cut_length = 0.0
        total_pierces = 0
        total_parts_weight = 0.0
        layouts_summary = []

        for layout in layouts:
            parts = parts_by_layout.get(layout.id, [])
            layout_parts_weight = sum(p.weight or 0 for p in parts)
            sc = layout.sheet_count or 1

            total_cut_length += (layout.cut_length or 0) * sc
            total_pierces += (layout.pierces or 0) * sc
            total_parts_weight += layout_parts_weight * sc

            layouts_summary.append({
                "layout_code": layout.layout_code,
                "machine_type": layout.machine_type,
                "sheet_w": layout.sheet_w,
                "sheet_h": layout.sheet_h,
                "sheet_weight": layout.sheet_weight,
                "sheet_count": sc,
                "cut_time": layout.cut_time,
                "move_time": layout.move_time,
                "pierce_time": layout.pierce_time,
                "cut_length": layout.cut_length,
                "travel_length": layout.travel_length,
                "pierces": layout.pierces,
                "parts_count": len(parts),
                "parts_weight": round(layout_parts_weight, 3)
            })

        mt = (layouts[0].machine_type.upper() if layouts and layouts[0].machine_type else "")
        machine = "станок 1" if "CNF" in mt else "станок 2" if "FNF" in mt else (layouts[0].machine_type if layouts else "")
        total_sheets = sum(l.sheet_count or 1 for l in layouts)
        total_sheets_weight = sum((l.sheet_weight or 0) * (l.sheet_count or 1) for l in layouts)

        enriched.append({
            "id": app.id,
            "order_name": app.order_name,
            "customer": cust.name if cust else "-",
            "customer_id": app.customer_id,
            "created_at": app.created_at.isoformat() if app.created_at else None,
            "material": app.material,
            "steel_grade": app.steel_grade,
            "thickness": app.thickness,
            "supply_material": app.supply_material,
            "machine": machine,
            "total_parts_count": app.total_parts_count,
            "total_weight": round(total_sheets_weight, 1),
            "total_cut_length": round(total_cut_length, 1),
            "total_pierces": total_pierces,
            "total_parts_weight": round(total_parts_weight, 3),
            "layouts_count": len(layouts),
            "total_sheets": total_sheets,
            "layouts": layouts_summary,
            "cut_at": app.cut_at.isoformat() if app.cut_at else None,
            "status": app.status
        })

    return enriched


@router.get("/customers")
async def list_customers(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(select(Customer).order_by(Customer.name))
    customers = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in customers]
