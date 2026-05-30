from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, DeclarativeBase


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    objects: Mapped[List["Object"]] = relationship(back_populates="customer", cascade="all, delete-orphan")
    orders: Mapped[List["Order"]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class Object(Base):
    __tablename__ = "objects"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    name: Mapped[str] = mapped_column(String(100))

    customer: Mapped["Customer"] = relationship(back_populates="objects")
    orders: Mapped[List["Order"]] = relationship(back_populates="object_rel")


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
    layout: Mapped["Layout"] = relationship(back_populates="file_version", uselist=False, cascade="all, delete-orphan")


class Layout(Base):
    __tablename__ = "layouts"

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
    parts: Mapped[List["Part"]] = relationship(back_populates="layout", cascade="all, delete-orphan")


class Part(Base):
    __tablename__ = "parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id"))
    name: Mapped[str] = mapped_column(String(100))
    dx: Mapped[float] = mapped_column(Float)
    dy: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)

    layout: Mapped["Layout"] = relationship(back_populates="parts")