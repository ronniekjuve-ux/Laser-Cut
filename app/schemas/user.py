from pydantic import BaseModel
from app.db.models import UserRole, UserStatus


class UserCreate(BaseModel):
    username: str
    email: str | None = None
    password: str
    role: UserRole | None = None


class UserUpdate(BaseModel):
    role: UserRole | None = None
    status: UserStatus | None = None
    password: str | None = None


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None
    role: UserRole
    status: UserStatus

    class Config:
        from_attributes = True