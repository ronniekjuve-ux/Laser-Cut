from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
from datetime import datetime, timedelta, timezone
from app.db.base import get_db
from app.models.user import User, UserRole, UserStatus
from app.db.models import AuditLog, ChangeLog, UserActivity, LoginHistory, user_customers, Customer
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.core.deps import require_role, log_audit
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])





async def _get_user_customers(user_id: int, db):
    result = await db.execute(
        select(user_customers.c.customer_id).where(user_customers.c.user_id == user_id)
    )
    cust_ids = [r[0] for r in result.all()]
    if not cust_ids:
        return [], []
    cust_result = await db.execute(select(Customer).where(Customer.id.in_(cust_ids)))
    customers = cust_result.scalars().all()
    return [c.id for c in customers], [c.name for c in customers]


async def _set_user_customers(user_id: int, customer_ids: list[int], db):
    await db.execute(user_customers.delete().where(user_customers.c.user_id == user_id))
    for cid in customer_ids:
        await db.execute(user_customers.insert().values(user_id=user_id, customer_id=cid))

def parse_user_agent(ua: str) -> str:
    if not ua:
        return ""
    ua_lower = ua.lower()
    if "python" in ua_lower or "httpx" in ua_lower or "curl" in ua_lower:
        return "API"
    os = "Другое"
    if "windows" in ua_lower:
        os = "Windows"
    elif "iphone" in ua_lower:
        os = "iPhone"
    elif "android" in ua_lower:
        os = "Android"
    elif "mac os" in ua_lower or "macintosh" in ua_lower:
        os = "Mac"
    elif "linux" in ua_lower:
        os = "Linux"
    browser = "Другое"
    if "edg" in ua_lower:
        browser = "Edge"
    elif "chrome" in ua_lower:
        browser = "Chrome"
    elif "firefox" in ua_lower:
        browser = "Firefox"
    elif "safari" in ua_lower:
        browser = "Safari"
    elif "opr" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    return f"{os} {browser}"


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
        payload: UserCreate,
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    role = payload.role or UserRole.OPERATOR
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        password_plain=payload.password,
        role=role,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    await db.flush()

    # Store plain password via raw SQL (column may not exist yet)
    try:
        await db.execute(text("UPDATE users SET password_plain = :pwd WHERE id = :id"), {"pwd": payload.password, "id": user.id})
    except Exception:
        pass

    if payload.customer_ids:
        await _set_user_customers(user.id, payload.customer_ids, db)

    await db.commit()
    await db.refresh(user)

    cust_ids, cust_names = await _get_user_customers(user.id, db)
    return UserOut(
        id=user.id, username=user.username, email=user.email,
        role=user.role, status=user.status,
        customer_ids=cust_ids, customer_names=cust_names
    )


@router.get("/")
async def list_users(
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    res = await db.execute(select(User))
    users = res.scalars().all()
    now = datetime.now(timezone.utc)
    result = []
    for u in users:
        is_online = False
        if u.last_active:
            la = u.last_active
            if la.tzinfo is None:
                la = la.replace(tzinfo=timezone.utc)
            is_online = (now - la) < timedelta(minutes=2)

        last_login_res = await db.execute(
            select(LoginHistory).where(LoginHistory.user_id == u.id)
            .order_by(LoginHistory.login_at.desc()).limit(1)
        )
        last_login = last_login_res.scalar_one_or_none()
        device_info = parse_user_agent(last_login.user_agent) if last_login and last_login.user_agent else None

        cust_ids, cust_names = await _get_user_customers(u.id, db)
        result.append({
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "role": u.role,
            "status": u.status,
            "last_active": u.last_active.isoformat() if u.last_active else None,
            "is_online": is_online,
            "device_info": device_info,
            "customer_ids": cust_ids,
            "customer_names": cust_names,
        })

    # Batch-fetch password_plain via raw SQL
    user_ids = [u["id"] for u in result]
    pwd_map = {}
    if user_ids:
        try:
            placeholders = ",".join([f":id{i}" for i in range(len(user_ids))])
            params = {f"id{i}": uid for i, uid in enumerate(user_ids)}
            pwd_result = await db.execute(
                text(f"SELECT id, password_plain FROM users WHERE id IN ({placeholders})"),
                params
            )
            for row in pwd_result.all():
                if row[1]:
                    pwd_map[row[0]] = row[1]
        except Exception:
            pass
    for u in result:
        u["password_plain"] = pwd_map.get(u["id"], "")

    return result


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
        user_id: int,
        payload: UserUpdate,
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalars().first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role:
        user.role = payload.role
    if payload.status:
        user.status = payload.status
    if payload.password:
        user.password_hash = get_password_hash(payload.password)
        try:
            await db.execute(text("UPDATE users SET password_plain = :pwd WHERE id = :id"), {"pwd": payload.password, "id": user.id})
        except Exception:
            pass
    if payload.customer_ids is not None:
        await _set_user_customers(user.id, payload.customer_ids, db)

    await db.commit()
    await db.refresh(user)
    await log_audit(admin, "UPDATE", "user", user_id, str(payload.model_dump(exclude_unset=True)), db)

    cust_ids, cust_names = await _get_user_customers(user.id, db)
    return UserOut(
        id=user.id, username=user.username, email=user.email,
        role=user.role, status=user.status,
        customer_ids=cust_ids, customer_names=cust_names
    )


@router.delete("/{user_id}")
async def delete_user(
        user_id: int,
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить себя")
    await db.delete(user)
    await db.commit()
    await log_audit(admin, "DELETE", "user", user_id, f"Deleted user {user.username}", db)
    return {"status": "success"}


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR, UserRole.CUSTOMER, UserRole.ACCOUNTANT))):
    return current_user


@router.get("/{user_id}/stats")
async def get_user_stats(
        user_id: int,
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    today_naive = today_start.replace(tzinfo=None)
    yesterday_naive = yesterday_start.replace(tzinfo=None)

    logins_today = await db.scalar(
        select(func.count(LoginHistory.id)).where(
            LoginHistory.user_id == user_id,
            LoginHistory.login_at >= today_start
        )
    ) or 0

    logins_yesterday = await db.scalar(
        select(func.count(LoginHistory.id)).where(
            LoginHistory.user_id == user_id,
            LoginHistory.login_at >= yesterday_start,
            LoginHistory.login_at < today_start
        )
    ) or 0

    actions_today = await db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.user_id == user_id,
            AuditLog.created_at >= today_naive
        )
    ) or 0

    changes_today = await db.scalar(
        select(func.count(ChangeLog.id)).where(
            ChangeLog.user_id == user_id,
            ChangeLog.created_at >= today_start
        )
    ) or 0

    total_logins = await db.scalar(
        select(func.count(LoginHistory.id)).where(LoginHistory.user_id == user_id)
    ) or 0

    avg_daily_logins_result = await db.execute(
        select(
            func.date(LoginHistory.login_at).label("day"),
            func.count(LoginHistory.id).label("cnt")
        ).where(LoginHistory.user_id == user_id)
        .group_by(func.date(LoginHistory.login_at))
    )
    daily_counts = [row.cnt for row in avg_daily_logins_result]
    avg_daily_logins = round(sum(daily_counts) / len(daily_counts), 1) if daily_counts else 0

    last_login_result = await db.execute(
        select(LoginHistory).where(LoginHistory.user_id == user_id)
        .order_by(desc(LoginHistory.login_at)).limit(1)
    )
    last_login = last_login_result.scalar_one_or_none()

    return {
        "logins_today": logins_today,
        "logins_yesterday": logins_yesterday,
        "actions_today": actions_today + changes_today,
        "total_logins": total_logins,
        "avg_daily_logins": avg_daily_logins,
        "last_login_at": last_login.login_at.isoformat() if last_login else None,
    }


@router.get("/{user_id}/activity")
async def get_user_activity(
        user_id: int,
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now_utc = datetime.now(timezone.utc)
    day_ago = now_utc - timedelta(hours=24)
    day_ago_naive = day_ago.replace(tzinfo=None)

    audit_result = await db.execute(
        select(AuditLog).where(
            AuditLog.user_id == user_id,
            AuditLog.created_at >= day_ago_naive
        ).order_by(desc(AuditLog.created_at)).limit(20)
    )
    audit_logs = audit_result.scalars().all()

    change_result = await db.execute(
        select(ChangeLog).where(
            ChangeLog.user_id == user_id,
            ChangeLog.created_at >= day_ago
        ).order_by(desc(ChangeLog.created_at)).limit(20)
    )
    change_logs = change_result.scalars().all()

    all_actions = []
    for l in audit_logs:
        all_actions.append({
            "type": "audit",
            "action": l.action,
            "resource": l.resource,
            "details": l.details,
            "created_at": l.created_at.isoformat(),
        })
    for l in change_logs:
        all_actions.append({
            "type": "changelog",
            "action": l.change_type,
            "resource": l.resource,
            "details": l.description,
            "created_at": l.created_at.isoformat(),
        })
    all_actions.sort(key=lambda x: x["created_at"], reverse=True)

    hourly_activity = []
    for h in range(24):
        hour_start = day_ago + timedelta(hours=h)
        hour_end = hour_start + timedelta(hours=1)
        count = await db.scalar(
            select(func.count(UserActivity.id)).where(
                UserActivity.user_id == user_id,
                UserActivity.timestamp >= hour_start,
                UserActivity.timestamp < hour_end
            )
        ) or 0
        hourly_activity.append({"hour": hour_start.strftime("%H:00"), "count": count})

    return {
        "actions": all_actions[:20],
        "hourly_activity": hourly_activity,
    }


@router.get("/{user_id}/history")
async def get_user_history(
        user_id: int,
        days: int = Query(7, ge=1, le=30),
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now_utc = datetime.now(timezone.utc)
    since = now_utc - timedelta(days=days)
    since_naive = since.replace(tzinfo=None)

    logins_result = await db.execute(
        select(LoginHistory).where(
            LoginHistory.user_id == user_id,
            LoginHistory.login_at >= since
        ).order_by(desc(LoginHistory.login_at))
    )
    logins = logins_result.scalars().all()

    daily_activity = []
    for d in range(days):
        day_start = since + timedelta(days=d)
        day_end = day_start + timedelta(days=1)
        count = await db.scalar(
            select(func.count(UserActivity.id)).where(
                UserActivity.user_id == user_id,
                UserActivity.timestamp >= day_start,
                UserActivity.timestamp < day_end
            )
        ) or 0
        daily_activity.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    total_actions = await db.scalar(
        select(func.count(AuditLog.id)).where(
            AuditLog.user_id == user_id,
            AuditLog.created_at >= since_naive
        )
    ) or 0

    total_changes = await db.scalar(
        select(func.count(ChangeLog.id)).where(
            ChangeLog.user_id == user_id,
            ChangeLog.created_at >= since
        )
    ) or 0

    return {
        "logins": [
            {
                "login_at": l.login_at.isoformat(),
                "logout_at": l.logout_at.isoformat() if l.logout_at else None,
                "ip_address": l.ip_address,
            }
            for l in logins
        ],
        "daily_activity": daily_activity,
        "total_logins": len(logins),
        "total_actions": total_actions + total_changes,
        "period_days": days,
    }


@router.get("/customers")
async def list_customers_for_assignment(
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN))
):
    result = await db.execute(select(Customer).order_by(Customer.name))
    customers = result.scalars().all()
    return [{"id": c.id, "name": c.name} for c in customers]
