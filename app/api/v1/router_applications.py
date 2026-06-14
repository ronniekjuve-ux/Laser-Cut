# -*- coding: utf-8 -*-
import json
import glob
import re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import joinedload
from typing import Optional, List
from pathlib import Path
from app.db.base import get_db
from app.db.models import (
    Application, ApplicationLayout, ApplicationLayoutPart, Customer,
    User, UserRole, ApplicationStatus, ApplicationPriority,
    DeficitRequest, Notification, ChangeLog
)
from app.core.deps import get_current_user, require_role
from app.services.unified_parser import (
    extract_text,
    parse_application_text,
    parse_layout_text,
    merge_data,
    ApplicationData,
    extract_images,
    normalize_name
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
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN))
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

        detail_images = extract_images(file_path, str(IMAGE_DIR), prefix="applications", filter_dft=True)

        # Маппинг: нормализованное имя детали -> изображение
        detail_image_map = {}
        if detail_images and data.parts:
            for ai, ap in enumerate(data.parts):
                key = normalize_name(ap.name_raw)
                if key and ai < len(detail_images):
                    detail_image_map[key] = detail_images[ai]
        images_json = json.dumps(detail_image_map) if detail_image_map else None

        if app:
            app.material = steel_grade if steel_grade else data.material
            app.steel_grade = steel_grade if steel_grade else app.steel_grade
            app.thickness = data.thickness
            app.total_weight = data.total_weight
            app.total_parts_count = len(data.parts)
            app.comments = comments if comments else app.comments
            if detail_image_map:
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
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN))
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

        # Ищем файлы с именем заказа, исключая файлы раскладок (_layout_)
        pattern = f"{UPLOAD_DIR}/{app.order_name}*"
        found_files = [
            f for f in glob.glob(pattern + ".*")
            if f.lower().endswith(('.doc', '.docx')) and '_layout_' not in f.lower()
        ]
        if not found_files:
            found_files = [
                f for f in glob.glob(f"{UPLOAD_DIR}/{app.order_name}*.doc")
                if '_layout_' not in f.lower()
            ]

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
            layout.cut_length = layout_data.cut_length
            layout.travel_length = layout_data.travel_length
            layout.pierces = layout_data.pierces
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
                cut_length=layout_data.cut_length,
                travel_length=layout_data.travel_length,
                pierces=layout_data.pierces,
                cnc_path=layout_data.cnc_path,
                layout_image=layout_image_path
            )
            db.add(layout)
            await db.flush()

        await db.execute(
            delete(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
        )

        thickness = app.thickness or 0.0
        detail_image_map = {}
        if app.detail_images:
            try:
                parsed = json.loads(app.detail_images)
                if isinstance(parsed, dict):
                    detail_image_map = parsed
                elif isinstance(parsed, list):
                    # Старый формат — список, маппим по имени из app_data.parts
                    if app_data.parts:
                        for ai, ap in enumerate(app_data.parts):
                            key = normalize_name(ap.name_raw)
                            if key and ai < len(parsed):
                                detail_image_map[key] = parsed[ai]
            except Exception:
                pass

        for pi, part_data in enumerate(merged_parts):
            part_weight = None
            if thickness > 0 and part_data.dx > 0 and part_data.dy > 0:
                part_weight = round(part_data.dx * part_data.dy * thickness * 7.85 / 1000000, 4)

            part_key = normalize_name(part_data.name)
            part_image = detail_image_map.get(part_key)

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

        await db.commit()

        # Пересчёт весов деталей с учётом обновлённой толщины
        if app.thickness and app.thickness > 0:
            parts_res = await db.execute(
                select(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
            )
            for part in parts_res.scalars().all():
                if part.dx > 0 and part.dy > 0:
                    part.weight = round(part.dx * part.dy * app.thickness * 7.85 / 1_000_000, 4)
            await db.commit()

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
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    # Если заказчик — только свои заявки
    customer_filter = None
    if user.role == UserRole.CUSTOMER and user.customer_id:
        customer_filter = user.customer_id

    # Если есть поиск — сначала найдём ID заявок по полям ИЛИ по деталям
    matching_app_ids = None
    if search:
        like_pattern = f"%{search}%"
        # Поиск по полям заявки
        field_q = select(Application.id).where(
            (Application.order_name.ilike(like_pattern)) |
            (Application.material.ilike(like_pattern)) |
            (Application.steel_grade.ilike(like_pattern)) |
            (Application.comments.ilike(like_pattern))
        )
        # Поиск по имени заказчика
        cust_q = select(Application.id).join(
            Customer, Application.customer_id == Customer.id
        ).where(Customer.name.ilike(like_pattern))
        # Поиск по деталям
        parts_q = select(ApplicationLayout.application_id).join(
            ApplicationLayoutPart, ApplicationLayoutPart.layout_id == ApplicationLayout.id
        ).where(ApplicationLayoutPart.name.ilike(like_pattern))
        # Объединяем
        from sqlalchemy import union
        combined = union(field_q, cust_q, parts_q)
        result_ids = await db.execute(select(combined.c.id))
        matching_app_ids = set(r[0] for r in result_ids.all())

    query = select(Application, Customer).join(Customer, Application.customer_id == Customer.id, isouter=True)
    if customer_filter:
        query = query.where(Application.customer_id == customer_filter)
    result = await db.execute(query.order_by(Application.created_at.desc()))
    rows = result.all()

    enriched = []
    for app, cust in rows:
        if matching_app_ids is not None and app.id not in matching_app_ids:
            continue

        # Get first layout machine type
        layouts_result = await db.execute(
            select(ApplicationLayout).where(ApplicationLayout.application_id == app.id).limit(1)
        )
        first_layout = layouts_result.scalar_one_or_none()
        machine = ""
        if first_layout and first_layout.machine_type:
            mt = first_layout.machine_type.upper()
            machine = "станок 1" if "CNF" in mt else "станок 2" if "FNF" in mt else first_layout.machine_type

        # Поиск по деталям — имена совпавших деталей
        matched_parts = []
        if search:
            parts_result = await db.execute(
                select(ApplicationLayoutPart.name)
                .join(ApplicationLayout, ApplicationLayoutPart.layout_id == ApplicationLayout.id)
                .where(
                    ApplicationLayout.application_id == app.id,
                    ApplicationLayoutPart.name.ilike(f"%{search}%")
                )
            )
            matched_parts = list(parts_result.scalars().all())

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
            "comments": app.comments,
            "status": app.status or "pending",
            "priority": app.priority or "medium",
            "matched_parts": matched_parts,
            "created_at": app.created_at
        })

    return enriched


@router.get("/changelog")
async def list_changelog(
        limit: int = Query(100, le=500),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(ChangeLog).order_by(ChangeLog.created_at.desc()).limit(limit)
    )
    logs = result.scalars().all()

    return [
        {
            "id": l.id,
            "user_name": l.user_name,
            "change_type": l.change_type,
            "resource": l.resource,
            "resource_id": l.resource_id,
            "description": l.description,
            "old_value": l.old_value,
            "new_value": l.new_value,
            "created_at": l.created_at
        }
        for l in logs
    ]


@router.get("/notifications/unread-count")
async def unread_count(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from sqlalchemy import func as sqlfunc
    result = await db.execute(
        select(sqlfunc.count(Notification.id))
        .where(Notification.user_id == user.id, Notification.is_read == False)
    )
    count = result.scalar() or 0
    return {"count": count}


@router.get("/notifications")
async def list_notifications(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    notifications = result.scalars().all()

    return [
        {
            "id": n.id,
            "type": n.type,
            "message": n.message,
            "is_read": n.is_read,
            "related_app_id": n.related_app_id,
            "created_at": n.created_at
        }
        for n in notifications
    ]


@router.patch("/notifications/{notif_id}/read")
async def mark_read(
        notif_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Notification).where(Notification.id == notif_id, Notification.user_id == user.id)
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")

    notif.is_read = True
    await db.commit()

    return {"status": "success"}


@router.get("/deficit")
async def list_deficit(
        status_filter: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    query = select(DeficitRequest)
    if status_filter:
        query = query.where(DeficitRequest.status == status_filter)
    if user.role == UserRole.CUSTOMER and user.customer_id:
        query = query.where(DeficitRequest.customer_name == user.username)

    result = await db.execute(query.order_by(DeficitRequest.created_at.desc()))
    deficits = result.scalars().all()

    # Получаем имена пользователей
    user_ids = list(set(d.created_by for d in deficits if d.created_by))
    user_map = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        for u in users_result.scalars().all():
            user_map[u.id] = u.username

    return [
        {
            "id": d.id,
            "application_id": d.application_id,
            "material": d.material,
            "thickness": d.thickness,
            "size": d.size,
            "quantity": d.quantity,
            "customer_name": d.customer_name,
            "status": d.status,
            "note": d.note,
            "created_by": user_map.get(d.created_by, "-"),
            "created_at": d.created_at
        }
        for d in deficits
    ]


@router.patch("/deficit/{deficit_id}/resolve")
async def resolve_deficit(
        deficit_id: int,
        status: str = Query("resolved"),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(select(DeficitRequest).where(DeficitRequest.id == deficit_id))
    deficit = result.scalar_one_or_none()
    if not deficit:
        raise HTTPException(status_code=404, detail="Запрос не найден")

    old_status = deficit.status
    deficit.status = status

    # Запись в историю изменений
    status_labels = {"pending": "Ожидает", "resolved": "Решено"}
    db.add(ChangeLog(
        user_id=user.id, user_name=user.username,
        change_type="deficit_status", resource="deficit", resource_id=deficit.id,
        description=f"Дефицит: {deficit.material} ({deficit.customer_name or '-'})",
        old_value=status_labels.get(old_status, old_status),
        new_value=status_labels.get(status, status)
    ))

    await db.commit()

    return {"status": "success"}


@router.patch("/deficit/{deficit_id}")
async def update_deficit(
        deficit_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
        body: dict = None
):
    if not body:
        raise HTTPException(status_code=400, detail="Тело запроса обязательно")

    result = await db.execute(select(DeficitRequest).where(DeficitRequest.id == deficit_id))
    deficit = result.scalar_one_or_none()
    if not deficit:
        raise HTTPException(status_code=404, detail="Запрос не найден")

    if "material" in body:
        deficit.material = body["material"]
    if "thickness" in body:
        deficit.thickness = body["thickness"]
    if "size" in body:
        deficit.size = body["size"]
    if "quantity" in body:
        deficit.quantity = body["quantity"]
    if "customer_name" in body:
        deficit.customer_name = body["customer_name"]
    if "note" in body:
        deficit.note = body["note"]

    # Запись в историю изменений
    db.add(ChangeLog(
        user_id=user.id, user_name=user.username,
        change_type="deficit_edit", resource="deficit", resource_id=deficit.id,
        description=f"Редактирование дефицита: {deficit.material} ({deficit.customer_name or '-'})",
        old_value=None, new_value="Обновлено"
    ))

    await db.commit()

    return {"status": "success"}


@router.get("/{app_id}")
async def get_application_details(
        app_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
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
            "cut_length": layout.cut_length,
            "travel_length": layout.travel_length,
            "pierces": layout.pierces,
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
async def delete_application(
        app_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()

    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    await db.delete(app)
    await db.commit()

    return {"status": "success", "message": "Заявка удалена"}


@router.patch("/{app_id}/priority")
async def update_priority(
        app_id: int,
        priority: str = Query(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    if priority not in ("low", "medium", "high", "urgent"):
        raise HTTPException(status_code=400, detail="Невалидный приоритет")

    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    app.priority = priority

    priority_labels = {"low": "Низкий", "medium": "Средний", "high": "Высокий", "urgent": "Срочно"}
    cust_name = ""
    order_date = app.created_at.strftime('%d.%m.%Y') if app.created_at else ""
    if app.customer_id:
        cust_result = await db.execute(select(Customer).where(Customer.id == app.customer_id))
        customer = cust_result.scalar_one_or_none()
        cust_name = f" | {customer.name}" if customer else ""
    db.add(ChangeLog(
        user_id=user.id, user_name=user.username,
        change_type="priority", resource="application", resource_id=app.id,
        description=f"{app.order_name}{cust_name} | {order_date}",
        old_value=priority_labels.get(app.priority, app.priority),
        new_value=priority_labels.get(priority, priority)
    ))

    await db.commit()

    return {"status": "success", "new_priority": priority}


@router.patch("/{app_id}/status")
async def update_application_status(
        app_id: int,
        status: str = Query(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    if status not in ("pending", "in_progress", "partially_cut", "cut"):
        raise HTTPException(status_code=400, detail="Невалидный статус")

    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    old_status = app.status
    app.status = status
    app.updated_by = user.id

    # Уведомление для заказчика и админов
    if old_status != status:
        status_labels = {
            "pending": "В очереди", "in_progress": "В работе",
            "partially_cut": "Вырезано частично", "cut": "Вырезано"
        }
        cust_name = ""
        order_date = app.created_at.strftime('%d.%m.%Y') if app.created_at else ""
        if app.customer_id:
            cust_result = await db.execute(select(Customer).where(Customer.id == app.customer_id))
            customer = cust_result.scalar_one_or_none()
            cust_name = f" | {customer.name}" if customer else ""
        old_label = status_labels.get(old_status, old_status or "В очереди")
        new_label = status_labels.get(status, status)
        msg = f"Заявка «{app.order_name}»{cust_name} ({order_date}): «{old_label}» → «{new_label}» ({user.username})"

        # Заказчику
        if app.customer_id:
            users_result = await db.execute(
                select(User).where(User.customer_id == app.customer_id, User.role == UserRole.CUSTOMER)
            )
            for cust_user in users_result.scalars().all():
                db.add(Notification(user_id=cust_user.id, type="status_change", message=msg, related_app_id=app.id))

        # Админам и директорам
        admins_result = await db.execute(
            select(User).where(User.role.in_([UserRole.ADMIN, UserRole.DIRECTOR]))
        )
        for admin_user in admins_result.scalars().all():
            if admin_user.id != user.id:
                db.add(Notification(user_id=admin_user.id, type="status_change", message=msg, related_app_id=app.id))

        # Запись в историю изменений
        status_labels_all = {
            "pending": "В очереди", "in_progress": "В работе",
            "partially_cut": "Вырезано частично", "cut": "Вырезано"
        }
        cust_name = ""
        order_date = app.created_at.strftime('%d.%m.%Y') if app.created_at else ""
        if app.customer_id:
            cust_result2 = await db.execute(select(Customer).where(Customer.id == app.customer_id))
            customer2 = cust_result2.scalar_one_or_none()
            cust_name = f" | {customer2.name}" if customer2 else ""
        db.add(ChangeLog(
            user_id=user.id, user_name=user.username,
            change_type="status", resource="application", resource_id=app.id,
            description=f"{app.order_name}{cust_name} | {order_date}",
            old_value=status_labels_all.get(old_status, old_status or "В очереди"),
            new_value=status_labels_all.get(status, status)
        ))

    await db.commit()

    return {"status": "success", "new_status": status}


@router.post("/{app_id}/deficit")
async def create_deficit(
        app_id: int,
        material: str = Form(...),
        thickness: str = Form(""),
        size: str = Form(""),
        quantity: str = Form(""),
        note: str = Form(""),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    cust_result = await db.execute(select(Customer).where(Customer.id == app.customer_id))
    customer = cust_result.scalar_one_or_none()

    deficit = DeficitRequest(
        application_id=app_id,
        material=material,
        thickness=float(thickness) if thickness else None,
        size=size or None,
        quantity=int(quantity) if quantity else None,
        customer_name=customer.name if customer else None,
        note=note or None,
        created_by=user.id
    )
    db.add(deficit)
    await db.flush()

    # Уведомление заказчику о нехватке металла
    if app.customer_id:
        order_date = app.created_at.strftime('%d.%m.%Y') if app.created_at else ""
        msg = f"Нехватка металла: {material}"
        if thickness:
            msg += f", толщина {thickness} мм"
        msg += f" — заявка «{app.order_name}» ({order_date})"
        if note:
            msg += f". {note}"

        users_result = await db.execute(
            select(User).where(User.customer_id == app.customer_id, User.role == UserRole.CUSTOMER)
        )
        for cust_user in users_result.scalars().all():
            db.add(Notification(user_id=cust_user.id, type="deficit", message=msg, related_app_id=app.id))

    await db.commit()

    return {"status": "success", "deficit_id": deficit.id}