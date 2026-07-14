# -*- coding: utf-8 -*-
import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, JSON, Enum as SAEnum, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


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


class ApplicationStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    PARTIALLY_CUT = "partially_cut"
    CUT = "cut"


class ApplicationPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.OPERATOR)
    status: Mapped[UserStatus] = mapped_column(SAEnum(UserStatus), default=UserStatus.ACTIVE)
    customer_id: Mapped[Optional[int]] = mapped_column(ForeignKey("customers.id"), nullable=True)
    last_active: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    customer: Mapped[Optional["Customer"]] = relationship(back_populates="users")


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    token_jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime]
    is_revoked: Mapped[bool] = mapped_column(default=False)
    device_info: Mapped[str | None] = mapped_column(String(100))


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int]
    action: Mapped[str] = mapped_column(String(50))
    resource: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[int | None]
    details: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    objects: Mapped[List["Object"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    applications: Mapped[List["Application"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    orders: Mapped[List["Order"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    users: Mapped[List["User"]] = relationship(back_populates="customer")


class Object(Base):
    __tablename__ = "objects"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    name: Mapped[str] = mapped_column(String(100))

    customer: Mapped["Customer"] = relationship(back_populates="objects")
    orders: Mapped[List["Order"]] = relationship(back_populates="object_rel")


class OrderGroup(Base):
    __tablename__ = "order_groups"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    applications: Mapped[List["Application"]] = relationship(back_populates="group")


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_name: Mapped[str] = mapped_column(String(50))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    material: Mapped[str] = mapped_column(String(50), default="Steel")
    steel_grade: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    thickness: Mapped[float] = mapped_column(Float)
    total_weight: Mapped[float] = mapped_column(Float, nullable=True)
    total_parts_count: Mapped[int] = mapped_column(Integer, default=0)
    placed_parts_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ordered_parts_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_time: Mapped[str] = mapped_column(String(20), default="00:00:00")
    detail_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    priority: Mapped[str] = mapped_column(String(20), default="medium")
    supply_material: Mapped[Optional[bool]] = mapped_column(default=None, nullable=True)
    cut_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cut_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("order_groups.id"), nullable=True)
    warehouse_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("warehouse_items.id"), nullable=True)
    sheets_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    warehouse_deducted: Mapped[Optional[bool]] = mapped_column(default=False, nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="applications")
    updater: Mapped[Optional["User"]] = relationship(foreign_keys=[updated_by])
    cutter: Mapped[Optional["User"]] = relationship(foreign_keys=[cut_by])
    layouts: Mapped[List["ApplicationLayout"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    group: Mapped[Optional["OrderGroup"]] = relationship(back_populates="applications")
    warehouse_item: Mapped[Optional["WarehouseItem"]] = relationship(foreign_keys=[warehouse_item_id])


class ApplicationLayout(Base):
    __tablename__ = "application_layouts"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    layout_code: Mapped[str] = mapped_column(String(50))
    machine_type: Mapped[str] = mapped_column(String(10))
    sheet_w: Mapped[float] = mapped_column(Float)
    sheet_h: Mapped[float] = mapped_column(Float)
    sheet_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sheet_count: Mapped[int] = mapped_column(Integer, default=1)
    completed_runs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cut_time: Mapped[str] = mapped_column(String(20))
    move_time: Mapped[str] = mapped_column(String(20))
    pierce_time: Mapped[str] = mapped_column(String(20))
    cut_length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    travel_length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pierces: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cnc_path: Mapped[str] = mapped_column(Text, nullable=True)
    layout_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    merged_from: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warehouse_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("warehouse_items.id"), nullable=True)
    layout_sheets_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    warehouse_bindings: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)

    application: Mapped["Application"] = relationship(back_populates="layouts")
    parts: Mapped[List["ApplicationLayoutPart"]] = relationship(back_populates="layout", cascade="all, delete-orphan")


class ApplicationLayoutPart(Base):
    __tablename__ = "application_layout_parts"
    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("application_layouts.id"))
    name: Mapped[str] = mapped_column(String(255))
    dx: Mapped[float] = mapped_column(Float)
    dy: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    image_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    layout: Mapped["ApplicationLayout"] = relationship(back_populates="parts")


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    object_id: Mapped[int] = mapped_column(ForeignKey("objects.id"), nullable=True)
    number: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    steel_grade: Mapped[str] = mapped_column(String(20), default="St3")
    active_version_id: Mapped[int] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship(back_populates="orders")
    object_rel: Mapped["Object"] = relationship(back_populates="orders")
    versions: Mapped[List["FileVersion"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class FileVersion(Base):
    __tablename__ = "file_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    version: Mapped[int] = mapped_column(Integer)
    original_filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(Text)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship(back_populates="versions")
    layout: Mapped["OrderLayout"] = relationship(back_populates="file_version", uselist=False, cascade="all, delete-orphan")


class OrderLayout(Base):
    __tablename__ = "order_layouts"
    id: Mapped[int] = mapped_column(primary_key=True)
    file_version_id: Mapped[int] = mapped_column(ForeignKey("file_versions.id"), unique=True)
    material: Mapped[str] = mapped_column(String(50))
    thickness: Mapped[float] = mapped_column(Float)
    sheet_w: Mapped[float] = mapped_column(Float)
    sheet_h: Mapped[float] = mapped_column(Float)
    weight: Mapped[float] = mapped_column(nullable=True)
    cut_length: Mapped[float] = mapped_column(Float)
    pierces: Mapped[int] = mapped_column(Integer)
    processing_time: Mapped[str] = mapped_column(String(15))

    file_version: Mapped["FileVersion"] = relationship(back_populates="layout")
    parts: Mapped[List["OrderPart"]] = relationship(back_populates="layout", cascade="all, delete-orphan")


class OrderPart(Base):
    __tablename__ = "order_parts"
    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("order_layouts.id"))
    name: Mapped[str] = mapped_column(String(100))
    dx: Mapped[float] = mapped_column(Float)
    dy: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)

    layout: Mapped["OrderLayout"] = relationship(back_populates="parts")


class DeficitRequest(Base):
    __tablename__ = "deficit_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[Optional[int]] = mapped_column(ForeignKey("applications.id"), nullable=True)
    material: Mapped[str] = mapped_column(String(50))
    thickness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    application: Mapped[Optional["Application"]] = relationship(foreign_keys=[application_id])
    creator: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by])


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(default=False)
    related_app_id: Mapped[Optional[int]] = mapped_column(ForeignKey("applications.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    related_app: Mapped[Optional["Application"]] = relationship(foreign_keys=[related_app_id])


class ChangeLog(Base):
    __tablename__ = "change_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user_name: Mapped[str] = mapped_column(String(50))
    change_type: Mapped[str] = mapped_column(String(50))
    resource: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    description: Mapped[str] = mapped_column(Text)
    old_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class UserActivity(Base):
    __tablename__ = "user_activity"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    action_type: Mapped[str] = mapped_column(String(50), default="api_call")
    details: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class LoginHistory(Base):
    __tablename__ = "login_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    logout_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class OperatorShift(Base):
    __tablename__ = "operator_shifts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    shift_type: Mapped[str] = mapped_column(String(10), default="day")
    hours: Mapped[float] = mapped_column(Float, default=8.0)
    machine_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class OperatorMonthlyStats(Base):
    __tablename__ = "operator_monthly_stats"
    __table_args__ = (UniqueConstraint("user_id", "month", name="uq_operator_month"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    month: Mapped[str] = mapped_column(String(7))
    planned_hours: Mapped[float] = mapped_column(Float, default=0.0)
    sick_hours: Mapped[float] = mapped_column(Float, default=0.0)
    vacation_hours: Mapped[float] = mapped_column(Float, default=0.0)
    overtime_hours: Mapped[float] = mapped_column(Float, default=0.0)
    hourly_rate: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class ScheduleOverride(Base):
    __tablename__ = "schedule_overrides"
    __table_args__ = (UniqueConstraint("date", name="uq_schedule_override_date"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    st1: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    st2: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    night: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    st1_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    st2_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    night_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WarehouseItem(Base):
    __tablename__ = "warehouse_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    metal: Mapped[str] = mapped_column(String(50))
    grade: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    thickness: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sheet_w: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sheet_h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sheet_count: Mapped[int] = mapped_column(Integer, default=0)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    min_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    article: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, unique=True)
    parent_article: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    parent_sheet_w: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parent_sheet_h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_rectangular: Mapped[bool] = mapped_column(default=True)
    vertices: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)
    item_type: Mapped[Optional[str]] = mapped_column(String(20), default="standard")
    owner: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_deducted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    creator: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by])
    movements: Mapped[List["WarehouseMovement"]] = relationship(back_populates="warehouse_item")
    remnants: Mapped[List["WarehouseRemnant"]] = relationship(back_populates="warehouse_item")


class WarehouseMovement(Base):
    __tablename__ = "warehouse_movement"
    id: Mapped[int] = mapped_column(primary_key=True)
    warehouse_item_id: Mapped[int] = mapped_column(ForeignKey("warehouse_items.id"))
    application_id: Mapped[Optional[int]] = mapped_column(ForeignKey("applications.id"), nullable=True)
    quantity_change: Mapped[int] = mapped_column(Integer)
    movement_type: Mapped[str] = mapped_column(String(20))
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    warehouse_item: Mapped["WarehouseItem"] = relationship(back_populates="movements")
    application: Mapped[Optional["Application"]] = relationship(foreign_keys=[application_id])
    creator: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by])


class WarehouseRemnant(Base):
    __tablename__ = "warehouse_remnants"
    id: Mapped[int] = mapped_column(primary_key=True)
    warehouse_item_id: Mapped[int] = mapped_column(ForeignKey("warehouse_items.id"))
    article: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, unique=True)
    original_w: Mapped[float] = mapped_column(Float)
    original_h: Mapped[float] = mapped_column(Float)
    vertices: Mapped[str] = mapped_column(JSON)
    area: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_available: Mapped[bool] = mapped_column(default=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    warehouse_item: Mapped["WarehouseItem"] = relationship(back_populates="remnants")
    creator: Mapped[Optional["User"]] = relationship(foreign_keys=[created_by])


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new")
    admin_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_response_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])


class ItemNote(Base):
    __tablename__ = "item_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_type: Mapped[str] = mapped_column(String(20))  # 'warehouse' or 'deficit'
    item_id: Mapped[int] = mapped_column(Integer, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    username: Mapped[str] = mapped_column(String(50))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(foreign_keys=[user_id])
