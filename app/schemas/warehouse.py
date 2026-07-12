# -*- coding: utf-8 -*-
from datetime import datetime
from pydantic import BaseModel


class WarehouseItemCreate(BaseModel):
    metal: str
    grade: str | None = None
    thickness: float | None = None
    sheet_w: float | None = None
    sheet_h: float | None = None
    size: str | None = None
    sheet_count: int = 0
    weight: float | None = None
    article: str | None = None
    item_type: str = "standard"
    owner: str | None = None
    note: str | None = None


class WarehouseItemUpdate(BaseModel):
    metal: str | None = None
    grade: str | None = None
    thickness: float | None = None
    sheet_w: float | None = None
    sheet_h: float | None = None
    size: str | None = None
    sheet_count: int | None = None
    weight: float | None = None
    article: str | None = None
    owner: str | None = None
    note: str | None = None
    min_quantity: int | None = None


class WarehouseDeductRequest(BaseModel):
    quantity: int
    application_id: int | None = None
    layout_id: int | None = None
    reason: str | None = None


class WarehouseReturnRequest(BaseModel):
    quantity: int
    application_id: int | None = None
    reason: str | None = None


class WarehouseMovementOut(BaseModel):
    id: int
    warehouse_item_id: int
    application_id: int | None
    quantity_change: int
    movement_type: str
    reason: str | None
    created_by: str | None
    created_at: datetime | None


class ApplicationWarehouseBind(BaseModel):
    warehouse_item_id: int
    layout_id: int | None = None
    sheets_used: int


class RemnantSplitRequest(BaseModel):
    x: float
    y: float
    w: float
    h: float
    note: str | None = None


class RemnantOut(BaseModel):
    id: int
    warehouse_item_id: int
    article: str | None
    original_w: float
    original_h: float
    vertices: str
    area: float | None
    weight: float | None
    is_available: bool
    note: str | None
    created_at: datetime | None
