# -*- coding: utf-8 -*-
import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, Enum as SAEnum, func
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


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.OPERATOR)
    status: Mapped[UserStatus] = mapped_column(SAEnum(UserStatus), default=UserStatus.ACTIVE)


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


class Object(Base):
    __tablename__ = "objects"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    name: Mapped[str] = mapped_column(String(100))

    customer: Mapped["Customer"] = relationship(back_populates="objects")
    orders: Mapped[List["Order"]] = relationship(back_populates="object_rel")


class Application(Base):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_name: Mapped[str] = mapped_column(String(50), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    material: Mapped[str] = mapped_column(String(50), default="Steel")
    steel_grade: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    thickness: Mapped[float] = mapped_column(Float)
    total_weight: Mapped[float] = mapped_column(Float, nullable=True)
    total_parts_count: Mapped[int] = mapped_column(Integer, default=0)
    total_time: Mapped[str] = mapped_column(String(20), default="00:00:00")
    detail_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="applications")
    layouts: Mapped[List["ApplicationLayout"]] = relationship(back_populates="application", cascade="all, delete-orphan")


class ApplicationLayout(Base):
    __tablename__ = "application_layouts"
    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    layout_code: Mapped[str] = mapped_column(String(50))
    machine_type: Mapped[str] = mapped_column(String(10))
    sheet_w: Mapped[float] = mapped_column(Float)
    sheet_h: Mapped[float] = mapped_column(Float)
    sheet_weight: Mapped[float] = mapped_column(Float, nullable=True)
    cut_time: Mapped[str] = mapped_column(String(20))
    move_time: Mapped[str] = mapped_column(String(20))
    pierce_time: Mapped[str] = mapped_column(String(20))
    cut_length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    travel_length: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pierces: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cnc_path: Mapped[str] = mapped_column(Text, nullable=True)
    layout_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

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
