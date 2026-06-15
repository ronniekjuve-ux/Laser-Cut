from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.db.base import get_db
from app.models.user import User, UserStatus, UserRole
from app.models.session import Session
from app.db.models import LoginHistory
from app.schemas.auth import LoginRequest, TokenResponse, QRLoginRequest
from app.core.security import verify_password, create_token, get_password_hash
from app.core.deps import get_current_user
import uuid
import datetime

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(or_(User.username == req.username, User.email == req.username))
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Account inactive")

    expires = datetime.timedelta(minutes=43200 if req.remember_me else 60)
    token = create_token({"sub": user.id, "role": user.role.value}, expires)

    jti = str(uuid.uuid4())
    session = Session(
        user_id=user.id,
        token_jti=jti,
        expires_at=datetime.datetime.utcnow() + expires
    )
    db.add(session)

    db.add(LoginHistory(
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:200]
    ))
    await db.commit()

    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/login/qr", response_model=TokenResponse)
async def login_qr(req: QRLoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(User).where(User.username == req.qr_payload, User.role == UserRole.OPERATOR)
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=401, detail="Invalid QR or inactive operator")

    token = create_token(
        {"sub": user.id, "role": user.role.value},
        datetime.timedelta(minutes=5)
    )
    jti = str(uuid.uuid4())
    db.add(Session(
        user_id=user.id,
        token_jti=jti,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
    ))
    await db.commit()

    return TokenResponse(access_token=token, token_type="bearer")


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoginHistory).where(
            LoginHistory.user_id == current_user.id,
            LoginHistory.logout_at.is_(None)
        ).order_by(LoginHistory.login_at.desc()).limit(1)
    )
    last_login = result.scalar_one_or_none()
    if last_login:
        last_login.logout_at = datetime.datetime.utcnow()
    await db.commit()
    return {"detail": "Logged out"}