# -*- coding: utf-8 -*-
import json
import glob
import re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload
from typing import Optional, List
from pathlib import Path
from app.db.base import get_db
from app.db.models import Application, ApplicationLayout, ApplicationLayoutPart, Customer
from app.services.unified_parser import (
    extract_text,
    parse_application_text,
    parse_layout_text,
    merge_data,
    ApplicationData,
    extract_images  # <-- Добавлено
)

router = APIRouter(prefix="/applications", tags=["Applications"])

UPLOAD_DIR = Path("/app/data/uploads")
IMAGE_DIR = Path("/app/data/images")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)


async def get_or_create_customer(db: AsyncSession, name: str) -> Customer:
    if not name:
        name = "Промстальмаш"
    result = await db.execute(select(Customer).where(Customer.name == name))
    customer = result.scalar_one_or_none()

    if not customer:
        customer = Customer(name=name)
        db.add(customer)
        await db.flush()

    return customer


def save_uploaded_file(file: UploadFile, order_name: str) -> str:
    safe_name = f"{order_name}_{file.filename}"
    file_path = UPLOAD_DIR / safe_name
    with open(file_path, "wb") as f:
        content = file.file.read()
        f.write(content)

    return str(file_path)


@router.post("/upload")
async def upload_application(
        file: UploadFile = File(...),
        customer_name: str = Form(""),
        steel_grade: str = Form(""),
        comments: str = Form(""),
        db: AsyncSession = Depends(get_db)
):
    if not file.filename.lower().endswith('.doc'):
        raise HTTPException(status_code=400, detail="Только .doc файлы")

    order_name = Path(file.filename).stem
    if order_name.endswith('.Dsp'):
        order_name = order_name[:-4]

    file_path = save_uploaded_file(file, order_name)

    try:
        text = extract_text(file_path)
        data = parse_application_text(text)

        if not data.order_name:
            data.order_name = order_name

        result = await db.execute(
            select(Application).where(Application.order_name == data.order_name)
        )
        app = result.scalar_one_or_none()

        detail_images = extract_images(file_path, str(IMAGE_DIR), prefix="applications")
        images_json = json.dumps(detail_images) if detail_images else None

        if app:
            app.material = steel_grade if steel_grade else data.material
            app.steel_grade = steel_grade if steel_grade else app.steel_grade
            app.thickness = data.thickness
            app.total_weight = data.total_weight
            app.total_parts_count = len(data.parts)
            app.comments = comments if comments else app.comments
            if detail_images:
                app.detail_images = images_json
        else:
            customer = await get_or_create_customer(db, customer_name or "Промстальмаш")
            app = Application(
                order_name=data.order_name,
                customer_id=customer.id,
                material=steel_grade if steel_grade else data.material,
                steel_grade=steel_grade if steel_grade else None,
                thickness=data.thickness,
                total_weight=data.total_weight,
                total_parts_count=len(data.parts),
                detail_images=images_json,
                comments=comments if comments else None
            )
            db.add(app)

        await db.commit()
        await db.refresh(app)

        return {
            "status": "success",
            "application_id": app.id,
            "order_name": app.order_name,
            "parts_found": len(data.parts),
            "images_count": len(detail_images)
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга: {str(e)}")


@router.post("/{app_id}/layouts/upload")
async def upload_layout(
        app_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    filename = file.filename.lower()
    machine_type = "FNF" if "fnf" in filename else "CNF"

    code_match = re.search(r'(\d{3})', file.filename)
    layout_code = code_match.group(1) if code_match else "001"

    file_path = save_uploaded_file(file, f"{app.order_name}_layout_{layout_code}")

    try:
        text = extract_text(file_path)
        layout_data = parse_layout_text(text, file.filename)

        # === Извлечение изображения раскладки ===
        layout_images = extract_images(file_path, str(IMAGE_DIR), prefix=f"layouts/{app.order_name}_{layout_code}")
        layout_image_path = layout_images[0] if layout_images else None

        # === Ищем файл заявки (для весов и чистых имен) ===
        print(f"\n🔍 Ищем файл заявки: {app.order_name}*.doc")

        # Ищем файлы с именем заказа (учитываем .DOC и .doc)
        pattern = f"{UPLOAD_DIR}/{app.order_name}*"
        found_files = [f for f in glob.glob(pattern + ".*") if f.lower().endswith(('.doc', '.docx'))]
        if not found_files:
            found_files = glob.glob(f"{UPLOAD_DIR}/{app.order_name}*.doc")

        app_data = ApplicationData()  # Пустая по умолчанию

        if found_files:
            app_file_path = Path(found_files[0])
            print(f"✅ Файл заявки найден: {app_file_path.name}")
            app_text = extract_text(str(app_file_path))
            app_data = parse_application_text(app_text)
        else:
            print(f"⚠️ Файл заявки НЕ найден")

        # Объединяем данные (Веса из заявки, Размеры из раскладки)
        merged_parts = merge_data(app_data, layout_data)

        # ... код сохранения Layout ...
        result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.application_id == app_id,
                ApplicationLayout.layout_code == layout_code,
                ApplicationLayout.machine_type == machine_type
            )
        )
        layout = result.scalar_one_or_none()

        if layout:
            layout.sheet_w = layout_data.sheet_w
            layout.sheet_h = layout_data.sheet_h
            layout.sheet_weight = layout_data.sheet_weight
            layout.cut_time = layout_data.cut_time
            layout.move_time = layout_data.move_time
            layout.pierce_time = layout_data.pierce_time
            layout.cnc_path = layout_data.cnc_path
            if layout_image_path:
                layout.layout_image = layout_image_path
        else:
            layout = ApplicationLayout(
                application_id=app_id,
                layout_code=layout_code,
                machine_type=machine_type,
                sheet_w=layout_data.sheet_w,
                sheet_h=layout_data.sheet_h,
                sheet_weight=layout_data.sheet_weight,
                cut_time=layout_data.cut_time,
                move_time=layout_data.move_time,
                pierce_time=layout_data.pierce_time,
                cnc_path=layout_data.cnc_path,
                layout_image=layout_image_path
            )
            db.add(layout)
            await db.flush()

        await db.execute(
            delete(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
        )

        thickness = app.thickness or 0.0
        detail_images = []
        if app.detail_images:
            try:
                detail_images = json.loads(app.detail_images)
            except Exception:
                pass

        for pi, part_data in enumerate(merged_parts):
            # Calculate weight: dx(mm) * dy(mm) * thickness(mm) * 7.85 / 1000000
            part_weight = None
            if thickness > 0 and part_data.dx > 0 and part_data.dy > 0:
                part_weight = round(part_data.dx * part_data.dy * thickness * 7.85 / 1000000, 4)

            # Assign image by index
            part_image = detail_images[pi] if pi < len(detail_images) else None

            part = ApplicationLayoutPart(
                layout_id=layout.id,
                name=part_data.name,
                dx=part_data.dx,
                dy=part_data.dy,
                quantity=part_data.quantity,
                weight=part_weight,
                image_path=part_image
            )
            db.add(part)

        await db.commit()
        await db.refresh(layout)

        # ✅ ДОБАВИТЬ СЮДА: Заполняем пропуски в Заявке данными из Раскладки
        if app.thickness == 0.0 and layout_data.thickness > 0.0:
            app.thickness = layout_data.thickness

        if app.total_weight is None and layout_data.sheet_weight:
            app.total_weight = layout_data.sheet_weight

        await db.commit()  # Сохраняем обновленную заявку

        return {
            "status": "success",
            "layout_id": layout.id,
            "layout_code": layout_code,
            "machine_type": machine_type,
            "parts_count": len(merged_parts),
            "layout_image": layout_image_path,
            "message": "Раскладка создана"
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга: {str(e)}")


@router.get("/")
async def list_applications(
        search: Optional[str] = None,
        db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Application, Customer).join(Customer, Application.customer_id == Customer.id, isouter=True)
        .order_by(Application.created_at.desc())
    )
    rows = result.all()

    enriched = []
    for app, cust in rows:
        # Get first layout machine type
        layouts_result = await db.execute(
            select(ApplicationLayout).where(ApplicationLayout.application_id == app.id).limit(1)
        )
        first_layout = layouts_result.scalar_one_or_none()
        machine = ""
        if first_layout and first_layout.machine_type:
            mt = first_layout.machine_type.upper()
            machine = "станок 1" if "CNF" in mt else "станок 2" if "FNF" in mt else first_layout.machine_type

        enriched.append({
            "id": app.id,
            "order_name": app.order_name,
            "customer": cust.name if cust else "-",
            "material": app.material,
            "steel_grade": app.steel_grade,
            "thickness": app.thickness,
            "total_parts": app.total_parts_count,
            "total_weight": app.total_weight,
            "machine": machine,
            "created_at": app.created_at
        })

    return enriched


@router.get("/{app_id}")
async def get_application_details(app_id: int, db: AsyncSession = Depends(get_db)):
    # Сначала получаем заявку
    result = await db.execute(
        select(Application).where(Application.id == app_id)
    )
    app = result.scalar_one_or_none()

    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    # Получаем customer отдельно
    customer_name = None
    if app.customer_id:
        cust_result = await db.execute(
            select(Customer).where(Customer.id == app.customer_id)
        )
        customer = cust_result.scalar_one_or_none()
        if customer:
            customer_name = customer.name

    # Получаем все раскладки
    layouts_result = await db.execute(
        select(ApplicationLayout).where(ApplicationLayout.application_id == app_id)
    )
    layouts = layouts_result.scalars().all()

    layouts_data = []
    for layout in layouts:
        # Получаем детали для каждой раскладки
        parts_result = await db.execute(
            select(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
        )
        parts = parts_result.scalars().all()

        layouts_data.append({
            "id": layout.id,
            "layout_code": layout.layout_code,
            "machine_type": layout.machine_type,
            "sheet_size": f"{layout.sheet_w}x{layout.sheet_h}",
            "sheet_weight": layout.sheet_weight,
            "cut_time": layout.cut_time,
            "move_time": layout.move_time,
            "pierce_time": layout.pierce_time,
            "cnc_path": layout.cnc_path,
            "layout_image": layout.layout_image,
            "parts_count": len(parts),
            "parts": [
                {
                    "name": part.name,
                    "dx": part.dx,
                    "dy": part.dy,
                    "quantity": part.quantity,
                    "weight": part.weight,
                    "image_path": part.image_path
                }
                for part in parts
            ]
        })

    return {
        "application": {
            "id": app.id,
            "order_name": app.order_name,
            "customer": customer_name,
            "material": app.material,
            "steel_grade": app.steel_grade or app.material,
            "thickness": app.thickness,
            "total_parts": app.total_parts_count,
            "total_weight": app.total_weight,
            "comments": app.comments,
            "detail_images": app.detail_images,
            "created_at": app.created_at
        },
        "layouts": layouts_data,
        "summary": {
            "total_layouts": len(layouts_data),
            "total_parts_in_layouts": sum(len(ld["parts"]) for ld in layouts_data)
        }
    }


@router.delete("/{app_id}")
async def delete_application(app_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()

    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    await db.delete(app)
    await db.commit()

    return {"status": "success", "message": "Заявка удалена"}