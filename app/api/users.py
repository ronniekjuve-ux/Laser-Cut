from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.base import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.user import UserCreate, UserUpdate, UserOut
from app.core.deps import require_role, log_audit
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["Users"])


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
        role=role,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    #await log_audit(None, "CREATE", "user", user.id, f"role={role}", db)
    return user


@router.get("/", response_model=list[UserOut])
async def list_users(
        db: AsyncSession = Depends(get_db),
        admin: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    res = await db.execute(select(User))
    return res.scalars().all()


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

    await db.commit()
    await db.refresh(user)
    await log_audit(admin, "UPDATE", "user", user_id, str(payload.model_dump(exclude_unset=True)), db)
    return user

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR, UserRole.CUSTOMER, UserRole.ACCOUNTANT))):
    return current_user
