from sqlalchemy import String, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    DIRECTOR = "director"
    OPERATOR = "operator"
    CUSTOMER = "customer"
    ACCOUNTANT = "accountant"

class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.OPERATOR)
    status: Mapped[UserStatus] = mapped_column(SAEnum(UserStatus), default=UserStatus.ACTIVE)