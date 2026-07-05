# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.base import get_db
from app.db.models import WarehouseItem, ItemNote, DeficitRequest
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


@router.get("/export")
async def export_warehouse_xlsx(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    from app.services.exporters import export_warehouse

    result = await db.execute(
        select(WarehouseItem).order_by(desc(WarehouseItem.created_at))
    )
    items = result.scalars().all()

    data = [
        {
            "id": i.id,
            "metal": i.metal,
            "grade": i.grade or "",
            "size": i.size or "",
            "sheet_count": i.sheet_count,
            "owner": i.owner or "",
            "note": i.note or "",
            "created_at": i.created_at.strftime('%d.%m.%Y') if i.created_at else "",
        }
        for i in items
    ]

    output = export_warehouse(data)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=warehouse.xlsx"}
    )


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

    try:
        from app.main import manager
        await manager.broadcast({
            "type": "notification",
            "message": f"Склад: добавлен {metal}"
        })
    except Exception:
        pass

    return {"status": "success"}


# === Item Notes (chat-like) ===

@router.get("/notes/{item_type}/{item_id}")
async def get_item_notes(
        item_type: str,
        item_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    if item_type not in ('warehouse', 'deficit'):
        raise HTTPException(status_code=400, detail="Invalid item type")

    result = await db.execute(
        select(ItemNote)
        .where(ItemNote.item_type == item_type, ItemNote.item_id == item_id)
        .order_by(desc(ItemNote.created_at))
    )
    notes = result.scalars().all()
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "username": n.username,
            "text": n.text,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes
    ]


@router.post("/notes/{item_type}/{item_id}")
async def add_item_note(
        item_type: str,
        item_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    if item_type not in ('warehouse', 'deficit'):
        raise HTTPException(status_code=400, detail="Invalid item type")

    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    note = ItemNote(
        item_type=item_type,
        item_id=item_id,
        user_id=user.id,
        username=user.username,
        text=text,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    return {
        "id": note.id,
        "user_id": note.user_id,
        "username": note.username,
        "text": note.text,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.delete("/notes/{item_type}/{item_id}/{note_id}")
async def delete_item_note(
        item_type: str,
        item_id: int,
        note_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN))
):
    result = await db.execute(
        select(ItemNote).where(ItemNote.id == note_id, ItemNote.item_type == item_type, ItemNote.item_id == item_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    await db.delete(note)
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

    try:
        from app.main import manager
        await manager.broadcast({
            "type": "notification",
            "message": f"Склад: удалена запись #{item_id}"
        })
    except Exception:
        pass

    return {"status": "success"}
