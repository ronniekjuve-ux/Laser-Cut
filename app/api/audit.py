from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.user import User, UserRole
from app.core.deps import get_current_user, mask_timestamp

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/logs")
async def get_audit_logs(
        limit: int = Query(50, le=200),
        offset: int = Query(0),
        resource: str | None = None,
        db: AsyncSession = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    stmt = select(AuditLog)

    if current_user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        stmt = stmt.where(AuditLog.user_id == current_user.id)

    if resource:
        stmt = stmt.where(AuditLog.resource == resource)

    stmt = stmt.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit)
    res = await db.execute(stmt)
    logs = res.scalars().all()

    return [
        {
            "id": l.id,
            "user_id": l.user_id,
            "action": l.action,
            "resource": l.resource,
            "resource_id": l.resource_id,
            "details": l.details,
            "created_at_display": mask_timestamp(l.created_at, current_user.role.value)
        }
        for l in logs
    ]