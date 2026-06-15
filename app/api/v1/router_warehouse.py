# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.base import get_db
from app.db.models import WarehouseItem
from app.models.user import User, UserRole
from app.core.deps import require_role

router = APIRouter(prefix="/warehouse", tags=["Warehouse"])


@router.get("/")
async def list_warehouse(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(
        select(WarehouseItem).order_by(desc(WarehouseItem.created_at))
    )
    items = result.scalars().all()
    return [
        {
            "id": i.id,
            "metal": i.metal,
            "grade": i.grade,
            "size": i.size,
            "sheet_count": i.sheet_count,
            "owner": i.owner,
            "note": i.note,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in items
    ]


@router.post("/")
async def create_warehouse_item(
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    metal = body.get("metal", "")
    if not metal:
        raise HTTPException(status_code=400, detail="Металл обязателен")

    item = WarehouseItem(
        metal=metal,
        grade=body.get("grade"),
        size=body.get("size"),
        sheet_count=int(body["sheet_count"]) if body.get("sheet_count") else 0,
        owner=body.get("owner"),
        note=body.get("note"),
        created_by=user.id,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"status": "success", "id": item.id}


@router.patch("/{item_id}")
async def update_warehouse_item(
        item_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    for field in ("metal", "grade", "size", "owner", "note"):
        if field in body:
            setattr(item, field, body[field])
    if "sheet_count" in body:
        item.sheet_count = int(body["sheet_count"]) if body["sheet_count"] else 0

    await db.commit()
    return {"status": "success"}


@router.delete("/{item_id}")
async def delete_warehouse_item(
        item_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    await db.delete(item)
    await db.commit()
    return {"status": "success"}
