from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pathlib import Path
import os
import shutil

from app.db.base import get_db
from app.db.models import Customer, Object, Order, FileVersion, Layout, Part
from app.services.cypcut_parser import CypcutParser

router = APIRouter(prefix="/orders", tags=["Orders"])

UPLOAD_DIR = Path("/app/data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


async def get_or_create_customer(db: AsyncSession, name: str) -> Customer:
    result = await db.execute(select(Customer).where(Customer.name == name))
    customer = result.scalar_one_or_none()
    if not customer:
        customer = Customer(name=name)
        db.add(customer)
        await db.flush()
    return customer


async def get_or_create_object(db: AsyncSession, customer_id: int, name: Optional[str]) -> Optional[Object]:
    if not name:
        return None
    result = await db.execute(select(Object).where(
        Object.customer_id == customer_id,
        Object.name == name
    ))
    obj = result.scalar_one_or_none()
    if not obj:
        obj = Object(customer_id=customer_id, name=name)
        db.add(obj)
        await db.flush()
    return obj


@router.post("/upload")
async def upload_layout(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        customer_name: str = Form(...),
        object_name: Optional[str] = Form(None),
        order_number: Optional[str] = Form(None),
        steel_grade: str = Form("St3"),
        db: AsyncSession = Depends(get_db)
):
    """Загрузка файла раскладки CYPCUT"""

    # Читаем файл
    content = await file.read()

    # Парсим
    try:
        data = CypcutParser.parse_bytes(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга: {str(e)}")

    # Определяем номер заказа
    if not order_number:
        order_number = f"ORD-{data.order_number or 'AUTO'}"

    # Получаем или создаем заказчика
    customer = await get_or_create_customer(db, customer_name)

    # Получаем или создаем объект
    obj = await get_or_create_object(db, customer.id, object_name)

    # Ищем существующий заказ или создаем новый
    result = await db.execute(select(Order).where(Order.number == order_number))
    order = result.scalar_one_or_none()

    if order:
        # Обновляем существующий заказ
        order.customer_id = customer.id
        order.object_id = obj.id if obj else None
        order.steel_grade = steel_grade

        # Определяем новую версию
        result = await db.execute(
            select(FileVersion)
            .where(FileVersion.order_id == order.id)
            .order_by(FileVersion.version.desc())
            .limit(1)
        )
        last_version = result.scalar_one_or_none()
        new_version = (last_version.version + 1) if last_version else 1
    else:
        # Создаем новый заказ
        order = Order(
            customer_id=customer.id,
            object_id=obj.id if obj else None,
            number=order_number,
            steel_grade=steel_grade,
            status="pending"
        )
        db.add(order)
        await db.flush()
        new_version = 1

    # Сохраняем файл
    safe_filename = f"{order.id}_v{new_version}_{file.filename}"
    file_path = UPLOAD_DIR / safe_filename

    with open(file_path, "wb") as f:
        shutil.copyfileobj(Path(file_path).open("wb"), file.file)
        # Или проще:
        with open(file_path, "wb") as f:
            f.write(content)

    # Создаем версию файла
    file_version = FileVersion(
        order_id=order.id,
        version=new_version,
        original_filename=file.filename,
        file_path=str(file_path)
    )
    db.add(file_version)
    await db.flush()

    # Создаем раскладку
    layout = Layout(
        file_version_id=file_version.id,
        material=data.material,
        thickness=data.thickness,
        sheet_w=data.sheet_w,
        sheet_h=data.sheet_h,
        weight=data.weight,
        cut_length=data.cut_length,
        pierces=data.pierces,
        processing_time=data.processing_time
    )
    db.add(layout)
    await db.flush()

    # Создаем детали
    for part_data in data.parts:
        part = Part(
            layout_id=layout.id,
            name=part_data["name"],
            dx=part_data["dx"],
            dy=part_data["dy"],
            quantity=part_data["quantity"]
        )
        db.add(part)

    # Устанавливаем активную версию
    order.active_version_id = file_version.id

    await db.commit()
    await db.refresh(order)

    return {
        "status": "success",
        "order_id": order.id,
        "order_number": order.number,
        "version": new_version,
        "parsed": {
            "material": data.material,
            "thickness": data.thickness,
            "sheet_size": f"{data.sheet_w}x{data.sheet_h}",
            "weight": data.weight,
            "cut_length": data.cut_length,
            "pierces": data.pierces,
            "processing_time": data.processing_time,
            "parts_count": len(data.parts)
        }
    }


@router.get("/")
async def list_orders(
        search: Optional[str] = None,
        status: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    """Список всех заявок с фильтрацией"""
    query = select(Order).join(Customer).outerjoin(Object)

    if search:
        query = query.where(
            (Order.number.ilike(f"%{search}%")) |
            (Customer.name.ilike(f"%{search}%")) |
            (Object.name.ilike(f"%{search}%"))
        )

    if status:
        query = query.where(Order.status == status)

    query = query.order_by(Order.created_at.desc())
    result = await db.execute(query)
    orders = result.scalars().all()

    return [
        {
            "id": o.id,
            "number": o.number,
            "customer": o.customer.name,
            "object": o.object_rel.name if o.object_rel else None,
            "steel_grade": o.steel_grade,
            "status": o.status,
            "active_version": o.active_version_id,
            "created_at": o.created_at
        }
        for o in orders
    ]


@router.get("/{order_id}")
async def get_order_details(order_id: int, db: AsyncSession = Depends(get_db)):
    """Детали заказа с раскладкой и деталями"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    # Получаем активную версию
    if order.active_version_id:
        result = await db.execute(
            select(FileVersion, Layout)
            .join(Layout)
            .where(FileVersion.id == order.active_version_id)
        )
        file_version, layout = result.first()

        # Получаем детали
        parts_result = await db.execute(
            select(Part).where(Part.layout_id == layout.id)
        )
        parts = parts_result.scalars().all()

        return {
            "order": {
                "id": order.id,
                "number": order.number,
                "customer": order.customer.name,
                "object": order.object_rel.name if order.object_rel else None,
                "steel_grade": order.steel_grade,
                "status": order.status
            },
            "version": {
                "id": file_version.id,
                "version": file_version.version,
                "filename": file_version.original_filename
            },
            "layout": {
                "material": layout.material,
                "thickness": layout.thickness,
                "sheet_size": f"{layout.sheet_w}x{layout.sheet_h}",
                "weight": layout.weight,
                "cut_length": layout.cut_length,
                "pierces": layout.pierces,
                "processing_time": layout.processing_time
            },
            "parts": [
                {
                    "name": p.name,
                    "dx": p.dx,
                    "dy": p.dy,
                    "quantity": p.quantity
                }
                for p in parts
            ]
        }

    return {"order": order}


@router.patch("/{order_id}/steel-grade")
async def update_steel_grade(
        order_id: int,
        steel_grade: str = Form(...),
        db: AsyncSession = Depends(get_db)
):
    """Обновление марки стали"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order.steel_grade = steel_grade
    await db.commit()

    return {"status": "success", "steel_grade": steel_grade}


@router.post("/{order_id}/status")
async def update_order_status(
        order_id: int,
        status: str = Form(...),  # pending, in_progress, done
        db: AsyncSession = Depends(get_db)
):
    """Обновление статуса заказа"""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Заказ не найден")

    order.status = status
    await db.commit()

    return {"status": "success", "order_status": status}