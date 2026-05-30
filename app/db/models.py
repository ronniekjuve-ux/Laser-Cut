from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, DeclarativeBase


class Base(DeclarativeBase):
    pass


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)

    # Связь с заявками
    applications: Mapped[List["Application"]] = relationship(back_populates="customer", cascade="all, delete-orphan")


class Application(Base):
    """ГЛАВНАЯ ЗАЯВКА (из файла .doc)"""
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_name: Mapped[str] = mapped_column(String(50), unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Основные параметры
    material: Mapped[str] = mapped_column(String(50), default="Steel")
    thickness: Mapped[float] = mapped_column(Float)
    total_weight: Mapped[float] = mapped_column(Float, nullable=True)
    total_parts_count: Mapped[int] = mapped_column(Integer, default=0)
    total_time: Mapped[str] = mapped_column(String(20), default="00:00:00")

    # ← ДОБАВЛЕНО: Поле для изображений деталей (JSON список путей)
    detail_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Связи
    customer: Mapped["Customer"] = relationship(back_populates="applications")
    layouts: Mapped[List["Layout"]] = relationship(back_populates="application", cascade="all, delete-orphan")


class Layout(Base):
    """РАСКЛАДКА (из файла .cnf.doc / .fnf.doc)"""
    __tablename__ = "layouts"

    id: Mapped[int] = mapped_column(primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("applications.id"))
    layout_code: Mapped[str] = mapped_column(String(50))
    machine_type: Mapped[str] = mapped_column(String(10))

    # Параметры листа
    sheet_w: Mapped[float] = mapped_column(Float)
    sheet_h: Mapped[float] = mapped_column(Float)
    sheet_weight: Mapped[float] = mapped_column(Float, nullable=True)

    # Время и путь
    cut_time: Mapped[str] = mapped_column(String(20))
    move_time: Mapped[str] = mapped_column(String(20))
    pierce_time: Mapped[str] = mapped_column(String(20))
    cnc_path: Mapped[str] = mapped_column(Text, nullable=True)

    # ← ДОБАВЛЕНО: Поле для изображения раскладки
    layout_image: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Связи
    application: Mapped["Application"] = relationship(back_populates="layouts")
    parts: Mapped[List["LayoutPart"]] = relationship(back_populates="layout", cascade="all, delete-orphan")


class LayoutPart(Base):
    """ДЕТАЛЬ В РАСКЛАДКЕ"""
    __tablename__ = "layout_parts"

    id: Mapped[int] = mapped_column(primary_key=True)
    layout_id: Mapped[int] = mapped_column(ForeignKey("layouts.id"))
    name: Mapped[str] = mapped_column(String(255))
    dx: Mapped[float] = mapped_column(Float)
    dy: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)

    layout: Mapped["Layout"] = relationship(back_populates="parts")