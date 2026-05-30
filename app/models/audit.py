from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base
import datetime

class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int]
    action: Mapped[str] = mapped_column(String(50))
    resource: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[int | None]
    details: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)