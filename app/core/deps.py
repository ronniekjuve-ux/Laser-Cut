from sqlalchemy import select
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends, HTTPException, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.models.user import User, UserRole, UserStatus
from app.core.security import decode_token
from app.models.audit import AuditLog
from fastapi.security import HTTPBearer
import uuid
import json
from datetime import datetime

oauth2_scheme = HTTPBearer()


async def get_current_user(token: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
                           db: AsyncSession = Depends(get_db)) -> User:
    try:
        token_str = token.credentials
        payload = decode_token(token_str)

        if not payload or payload.get("sub") is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

        user_id: int = int(payload["sub"])

        # ПРОВЕРКА РОЛИ (ИСПРАВЛЕНО)
        # Берем значение роли из токена (например, "admin")
        role_from_token = payload.get("role")
        # Собираем список допустимых значений ("admin", "operator"...)
        valid_roles = [r.value for r in UserRole]

        if role_from_token not in valid_roles:
            raise HTTPException(status_code=403, detail="Invalid role")

        # Получаем пользователя из БД
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()

        if not user or user.status != UserStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Account inactive")

        return user

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {str(e)}")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {str(e)}")


def require_role(*roles: UserRole):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return role_checker


async def log_audit(user: User, action: str, resource: str, resource_id: int | None, details: str | None,
                    db: AsyncSession):
    log = AuditLog(user_id=user.id, action=action, resource=resource, resource_id=resource_id, details=details)
    db.add(log)
    await db.flush()
    return log


def mask_timestamp(dt: datetime, role: str) -> str:
    """Админ видит полное время, остальные только дату"""
    if role == "admin":
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return dt.strftime("%Y-%m-%d")