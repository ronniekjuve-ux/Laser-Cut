# -*- coding: utf-8 -*-
import json
import glob
import re
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import joinedload
from typing import Optional, List
from pathlib import Path
from app.db.base import get_db
from app.db.models import (
    Application, ApplicationLayout, ApplicationLayoutPart, Customer,
    User, UserRole, ApplicationStatus, ApplicationPriority,
    DeficitRequest, Notification, ChangeLog, OrderGroup
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
        supply_material: str = Form(""),
        status: str = Form("pending"),
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

        app = None
        if status == "pending":
            result = await db.execute(
                select(Application).where(Application.order_name == data.order_name)
            )
            app = result.scalar_one_or_none()

        detail_images = extract_images(file_path, str(IMAGE_DIR), prefix="applications", filter_dft=True)

        # detail_images — список кортежей (image_path, dft_name)
        detail_image_map = {}
        if detail_images:
            for img_path, dft_name in detail_images:
                key = normalize_name(dft_name)
                if key:
                    detail_image_map[key] = img_path
        images_json = json.dumps(detail_image_map) if detail_image_map else None

        if app:
            app.material = steel_grade if steel_grade else data.material
            app.steel_grade = steel_grade if steel_grade else app.steel_grade
            app.thickness = data.thickness
            app.total_weight = data.total_weight
            app.total_parts_count = len(data.parts)
            app.comments = comments if comments else app.comments
            if supply_material == "true":
                app.supply_material = True
            elif supply_material == "false":
                app.supply_material = False
            if detail_image_map:
                app.detail_images = images_json
        else:
            customer = await get_or_create_customer(db, customer_name or "Промстальмаш")
            if status not in ("pending", "approved", "rejected", "in_progress", "partially_cut", "cut"):
                status = "pending"
            app = Application(
                order_name=data.order_name,
                customer_id=customer.id,
                material=steel_grade if steel_grade else data.material,
                steel_grade=steel_grade if steel_grade else None,
                thickness=data.thickness,
                total_weight=data.total_weight,
                total_parts_count=len(data.parts),
                detail_images=images_json,
                comments=comments if comments else None,
                supply_material=True if supply_material == "true" else False if supply_material == "false" else None,
                status=status,
            )
            db.add(app)

        await db.commit()
        await db.refresh(app)

        try:
            from app.services.cache import invalidate
            await invalidate("apps:")
        except Exception:
            pass

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
            layout.sheet_count = layout_data.sheet_count or 1
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
                sheet_count=layout_data.sheet_count or 1,
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
        tab: Optional[str] = Query(None),
        search: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from app.services.cache import get_redis, cache_key
    r = await get_redis()
    ckey = cache_key("apps", tab, search, page, limit, user.id)
    try:
        cached = await r.get(ckey)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

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

    query = select(Application, Customer).join(Customer, Application.customer_id == Customer.id, isouter=True).options(joinedload(Application.group))
    if customer_filter:
        query = query.where(Application.customer_id == customer_filter)

    if tab == "applications":
        query = query.where(Application.status.in_(["pending", "rejected"]))
    elif tab == "orders":
        query = query.where(Application.status.in_(["approved", "in_progress", "partially_cut", "cut"]))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query.order_by(Application.created_at.desc()).offset((page - 1) * limit).limit(limit))
    rows = result.all()

    enriched = []
    for app, cust in rows:
        if matching_app_ids is not None and app.id not in matching_app_ids:
            continue

        # Get first layout machine type
        layouts_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.application_id == app.id,
            )
        )
        all_layouts = layouts_result.scalars().all()
        active_layouts = [l for l in all_layouts if l.status in ("active", None)]
        replaced_layouts = [l for l in all_layouts if l.status == "replaced"]
        merged_layouts = [l for l in all_layouts if l.merged_from]
        first_layout = active_layouts[0] if active_layouts else None
        machine = ""
        is_replaced = len(all_layouts) > 0 and len(active_layouts) == 0 and len(replaced_layouts) > 0
        has_merged = len(merged_layouts) > 0
        if is_replaced:
            machine = "заменено"
        elif first_layout and first_layout.machine_type:
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
            "is_replaced": is_replaced,
            "has_merged": has_merged,
            "comments": app.comments,
            "status": app.status or "pending",
            "priority": app.priority or "medium",
            "supply_material": app.supply_material,
            "cut_at": app.cut_at.isoformat() if app.cut_at else None,
            "cut_by_id": app.cut_by,
            "matched_parts": matched_parts,
            "created_at": app.created_at,
            "group_id": app.group_id,
            "group_name": app.group.name if app.group else None,
        })

    cut_user_ids = set(e["cut_by_id"] for e in enriched if e.get("cut_by_id"))
    if cut_user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(cut_user_ids)))
        user_map = {u.id: u.username for u in users_result.scalars().all()}
        for e in enriched:
            if e.get("cut_by_id"):
                e["cut_by"] = user_map.get(e["cut_by_id"])
            else:
                e["cut_by"] = None
            del e["cut_by_id"]

    return {
        "items": enriched,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total > 0 else 0
    }

    return response


@router.get("/export")
async def export_applications_xlsx(
        tab: Optional[str] = Query(None),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from fastapi.responses import StreamingResponse
    from app.services.exporters import export_applications

    query = select(Application, Customer).join(Customer, Application.customer_id == Customer.id, isouter=True)
    if user.role == UserRole.CUSTOMER and user.customer_id:
        query = query.where(Application.customer_id == user.customer_id)
    if tab == "applications":
        query = query.where(Application.status.in_(["pending", "rejected"]))
    elif tab == "orders":
        query = query.where(Application.status.in_(["approved", "in_progress", "partially_cut", "cut"]))
    result = await db.execute(query.order_by(Application.created_at.desc()))
    rows = result.all()

    apps = []
    for app, cust in rows:
        apps.append({
            "id": app.id,
            "customer": cust.name if cust else "-",
            "order_name": app.order_name,
            "material": app.material,
            "steel_grade": app.steel_grade or "",
            "thickness": app.thickness,
            "supply_material": app.supply_material,
            "total_parts": app.total_parts_count,
            "total_weight": app.total_weight,
            "status": app.status,
            "priority": app.priority,
            "created_at": app.created_at.strftime('%d.%m.%Y') if app.created_at else "",
        })

    output = export_applications(apps)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=applications.xlsx"}
    )


@router.get("/changelog")
async def list_changelog(
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=200),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from sqlalchemy import func as sqlfunc

    total_result = await db.execute(select(sqlfunc.count(ChangeLog.id)))
    total = total_result.scalar() or 0

    offset = (page - 1) * limit
    result = await db.execute(
        select(ChangeLog).order_by(ChangeLog.created_at.desc()).offset(offset).limit(limit)
    )
    logs = result.scalars().all()

    return {
        "items": [
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
        ],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total > 0 else 0
    }


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


@router.post("/deficit")
async def create_deficit_standalone(
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    material = body.get("material", "")
    if not material:
        raise HTTPException(status_code=400, detail="Материал обязателен")

    deficit = DeficitRequest(
        material=material,
        thickness=float(body["thickness"]) if body.get("thickness") else None,
        size=body.get("size") or None,
        quantity=int(body["quantity"]) if body.get("quantity") else None,
        customer_name=body.get("customer_name") or None,
        note=body.get("note") or None,
        created_by=user.id
    )
    db.add(deficit)
    await db.commit()
    await db.refresh(deficit)

    return {"status": "success", "deficit_id": deficit.id}


@router.post("/merge")
async def merge_layouts(
        file: UploadFile = File(...),
        layout_ids: str = Form("[]"),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    try:
        source_refs = json.loads(layout_ids)
    except Exception:
        raise HTTPException(status_code=400, detail="Невалидный JSON layout_ids")

    if len(source_refs) < 2:
        raise HTTPException(status_code=400, detail="Нужно выбрать минимум 2 раскладки")

    layout_ids_list = [ref.get("layout_id") for ref in source_refs if ref.get("layout_id")]
    app_ids = [ref.get("app_id") for ref in source_refs if ref.get("app_id")]

    if layout_ids_list:
        result = await db.execute(
            select(ApplicationLayout)
            .options(joinedload(ApplicationLayout.parts), joinedload(ApplicationLayout.application))
            .where(ApplicationLayout.id.in_(layout_ids_list))
        )
        source_layouts = result.unique().scalars().all()
    elif app_ids:
        result = await db.execute(
            select(ApplicationLayout)
            .options(joinedload(ApplicationLayout.parts), joinedload(ApplicationLayout.application))
            .where(ApplicationLayout.application_id.in_(app_ids))
        )
        source_layouts = result.unique().scalars().all()
    else:
        raise HTTPException(status_code=400, detail="Невалидные ID раскладок")

    if not source_layouts:
        raise HTTPException(status_code=404, detail="Раскладки не найдены")

    file_path = save_uploaded_file(file, "merge")

    try:
        text = extract_text(file_path)
        new_layout_data = parse_layout_text(text, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ошибка парсинга раскладки: {str(e)}")

    source_parts_by_name = {}
    for sl in source_layouts:
        for part in sl.parts:
            key = normalize_name(part.name)
            if key not in source_parts_by_name:
                source_parts_by_name[key] = {"name": part.name, "dx": part.dx, "dy": part.dy, "quantity": 0, "layouts": []}
            source_parts_by_name[key]["quantity"] += part.quantity
            source_parts_by_name[key]["layouts"].append(sl.id)

    warnings = []
    new_parts_map = {}
    for part in new_layout_data.parts:
        key = normalize_name(part.name)
        if key not in new_parts_map:
            new_parts_map[key] = {"name": part.name, "dx": part.dx, "dy": part.dy, "quantity": 0}
        new_parts_map[key]["quantity"] += part.quantity

    for key, new_part in new_parts_map.items():
        if key not in source_parts_by_name:
            warnings.append(f"Деталь «{new_part['name']}» есть в новой раскладке, но отсутствует в исходных")
        else:
            src = source_parts_by_name[key]
            ndx, ndy = new_part["dx"], new_part["dy"]
            sdx, sdy = src["dx"], src["dy"]
            size_match = (abs(ndx - sdx) < 0.1 and abs(ndy - sdy) < 0.1) or (abs(ndx - sdy) < 0.1 and abs(ndy - sdx) < 0.1)
            if not size_match:
                warnings.append(f"Деталь «{new_part['name']}»: размер отличается (новая {ndx}x{ndy} vs исходная {sdx}x{sdy})")
            if new_part["quantity"] < src["quantity"]:
                warnings.append(f"Деталь «{new_part['name']}»: в новой раскладке {new_part['quantity']}шт, а в исходных {src['quantity']}шт")

    for key, src in source_parts_by_name.items():
        if key not in new_parts_map:
            warnings.append(f"Деталь «{src['name']}» есть в исходных раскладках ({src['quantity']}шт), но отсутствует в новой")

    app_ids = list(set(sl.application_id for sl in source_layouts if sl.application_id))
    customers = []
    for aid in app_ids:
        app_result = await db.execute(select(Application).where(Application.id == aid))
        app_obj = app_result.scalar_one_or_none()
        if app_obj and app_obj.customer_id:
            cust_result = await db.execute(select(Customer).where(Customer.id == app_obj.customer_id))
            cust = cust_result.scalar_one_or_none()
            if cust and cust.name not in customers:
                customers.append(cust.name)

    order_names = []
    for aid in app_ids:
        app_result = await db.execute(select(Application).where(Application.id == aid))
        app_obj = app_result.scalar_one_or_none()
        if app_obj and app_obj.order_name:
            order_names.append(app_obj.order_name)

    merged_name = "Слияние: " + " + ".join(order_names[:3])
    if len(order_names) > 3:
        merged_name += f" (+{len(order_names) - 3})"
    merged_name = merged_name[:50]

    first_app = None
    if app_ids:
        first_result = await db.execute(select(Application).where(Application.id == app_ids[0]))
        first_app = first_result.scalar_one_or_none()

    customer = None
    if customers:
        customer = await get_or_create_customer(db, customers[0])

    # Собираем detail_images из всех исходных заявок
    merged_detail_images = {}
    for aid in app_ids:
        app_result = await db.execute(select(Application).where(Application.id == aid))
        app_obj = app_result.scalar_one_or_none()
        if app_obj and app_obj.detail_images:
            try:
                parsed = json.loads(app_obj.detail_images)
                if isinstance(parsed, dict):
                    merged_detail_images.update(parsed)
            except Exception:
                pass

    existing_result = await db.execute(
        select(Application).where(Application.order_name == merged_name)
    )
    existing_app = existing_result.scalar_one_or_none()

    if existing_app:
        new_app = existing_app
        new_app.material = (new_layout_data.material or (first_app.material if first_app else "Steel"))[:50]
        new_app.steel_grade = first_app.steel_grade if first_app else new_app.steel_grade
        new_app.thickness = new_layout_data.thickness or (first_app.thickness if first_app else new_app.thickness)
        new_app.total_parts_count = sum(p.quantity for p in new_layout_data.parts)
        if merged_detail_images:
            new_app.detail_images = json.dumps(merged_detail_images)
        old_layouts_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.application_id == new_app.id,
                ApplicationLayout.status != "replaced"
            )
        )
        for old_layout in old_layouts_result.scalars().all():
            await db.execute(delete(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == old_layout.id))
            await db.delete(old_layout)
        await db.flush()
    else:
        new_app = Application(
            order_name=merged_name,
            customer_id=customer.id if customer else None,
            material=(new_layout_data.material or (first_app.material if first_app else "Steel"))[:50],
            steel_grade=first_app.steel_grade if first_app else None,
            thickness=new_layout_data.thickness or (first_app.thickness if first_app else 0.0),
            total_parts_count=sum(p.quantity for p in new_layout_data.parts),
            status="approved",
            supply_material=first_app.supply_material if first_app else None,
            comments="Объединённые заказчики: " + ", ".join(customers) if len(customers) > 1 else None,
            detail_images=json.dumps(merged_detail_images) if merged_detail_images else None,
        )
        db.add(new_app)
    await db.flush()

    machine_type = "FNF" if "fnf" in file.filename.lower() else "CNF"
    code_match = re.search(r"(\d{3})", file.filename)
    layout_code = code_match.group(1) if code_match else "001"

    layout_images = extract_images(file_path, str(IMAGE_DIR), prefix=f"layouts/merge_{new_app.id}_{layout_code}")
    layout_image_path = layout_images[0] if layout_images else None

    layout = ApplicationLayout(
        application_id=new_app.id,
        layout_code=layout_code,
        machine_type=machine_type,
        sheet_w=new_layout_data.sheet_w,
        sheet_h=new_layout_data.sheet_h,
        sheet_weight=new_layout_data.sheet_weight,
        sheet_count=new_layout_data.sheet_count or 1,
        cut_time=new_layout_data.cut_time,
        move_time=new_layout_data.move_time,
        pierce_time=new_layout_data.pierce_time,
        cut_length=new_layout_data.cut_length,
        travel_length=new_layout_data.travel_length,
        pierces=new_layout_data.pierces,
        cnc_path=new_layout_data.cnc_path,
        layout_image=layout_image_path,
        status="active",
        merged_from=json.dumps({
            "apps": [{"id": sl.application_id, "name": sl.application.order_name if sl.application else ""} for sl in source_layouts],
            "layouts": [{"id": sl.id, "code": sl.layout_code, "app_id": sl.application_id} for sl in source_layouts]
        })
    )
    db.add(layout)
    await db.flush()

    thickness = new_app.thickness or 0.0
    for part_data in new_layout_data.parts:
        part_weight = None
        if thickness > 0 and part_data.dx > 0 and part_data.dy > 0:
            part_weight = round(part_data.dx * part_data.dy * thickness * 7.85 / 1000000, 4)
        part_key = normalize_name(part_data.name)
        part_image = merged_detail_images.get(part_key)
        db.add(ApplicationLayoutPart(
            layout_id=layout.id,
            name=part_data.name,
            dx=part_data.dx,
            dy=part_data.dy,
            quantity=part_data.quantity,
            weight=part_weight,
            image_path=part_image,
        ))

    for sl in source_layouts:
        sl.status = "replaced"

    await db.commit()

    try:
        from app.services.cache import invalidate
        await invalidate("apps:")
    except Exception:
        pass

    return {
        "status": "success",
        "new_app_id": new_app.id,
        "order_name": merged_name,
        "warnings": warnings
    }


@router.post("/layouts/{layout_id}/unmerge")
async def unmerge_layout(
        layout_id: int,
        action: str = "cancel",
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    result = await db.execute(
        select(ApplicationLayout)
        .options(joinedload(ApplicationLayout.application))
        .where(ApplicationLayout.id == layout_id)
    )
    layout = result.unique().scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Раскладка не найдена")

    if not layout.merged_from:
        raise HTTPException(status_code=400, detail="Это не раскладка слияния")

    merged_data = json.loads(layout.merged_from)
    source_layout_ids = [l["id"] for l in merged_data.get("layouts", [])]

    if action == "cancel":
        if source_layout_ids:
            source_result = await db.execute(
                select(ApplicationLayout).where(ApplicationLayout.id.in_(source_layout_ids))
            )
            for sl in source_result.scalars().all():
                sl.status = "active"
        layout.status = "merge_cancelled"
    elif action == "restore":
        if source_layout_ids:
            source_result = await db.execute(
                select(ApplicationLayout).where(ApplicationLayout.id.in_(source_layout_ids))
            )
            for sl in source_result.scalars().all():
                sl.status = "replaced"
        layout.status = "active"
    else:
        raise HTTPException(status_code=400, detail="Неизвестное действие")

    await db.commit()

    try:
        from app.services.cache import invalidate
        await invalidate("apps:")
    except Exception:
        pass

    return {"status": "success", "message": "Слияние отменено" if action == "cancel" else "Слияние восстановлено"}


@router.post("/group")
async def create_group(
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    app_ids = body.get("app_ids", [])
    name = body.get("name", "")
    if len(app_ids) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 заявки")

    group = OrderGroup(name=name[:100] if name else None)
    db.add(group)
    await db.flush()

    result = await db.execute(
        select(Application).where(Application.id.in_(app_ids))
    )
    for app in result.scalars().all():
        app.group_id = group.id

    await db.commit()
    return {"status": "success", "group_id": group.id}


@router.delete("/group/{group_id}")
async def delete_group(
        group_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    result = await db.execute(select(OrderGroup).where(OrderGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    apps_result = await db.execute(
        select(Application).where(Application.group_id == group_id)
    )
    for app in apps_result.scalars().all():
        app.group_id = None

    await db.delete(group)
    await db.commit()
    return {"status": "success"}


@router.patch("/group/{group_id}/apps")
async def update_group_apps(
        group_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    add_ids = body.get("add", [])
    remove_ids = body.get("remove", [])

    if add_ids:
        result = await db.execute(
            select(Application).where(Application.id.in_(add_ids))
        )
        for app in result.scalars().all():
            app.group_id = group_id

    if remove_ids:
        result = await db.execute(
            select(Application).where(Application.id.in_(remove_ids))
        )
        for app in result.scalars().all():
            app.group_id = None

    await db.commit()
    return {"status": "success"}


@router.get("/group/{group_id}")
async def get_group_details(
        group_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(select(OrderGroup).where(OrderGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")

    apps_result = await db.execute(
        select(Application)
        .options(joinedload(Application.layouts))
        .where(Application.group_id == group_id)
        .order_by(Application.thickness)
    )
    apps = apps_result.unique().scalars().all()

    apps_data = []
    total_weight = 0
    total_parts = 0
    for app in apps:
        cust_result = await db.execute(select(Customer).where(Customer.id == app.customer_id))
        cust = cust_result.scalar_one_or_none()
        layouts_result = await db.execute(
            select(ApplicationLayout).where(ApplicationLayout.application_id == app.id)
        )
        layouts = layouts_result.scalars().all()
        active_layouts = [l for l in layouts if l.status == "active"]
        first_layout = active_layouts[0] if active_layouts else None
        machine = ""
        if first_layout and first_layout.machine_type:
            mt = first_layout.machine_type.upper()
            machine = "станок 1" if "CNF" in mt else "станок 2" if "FNF" in mt else first_layout.machine_type

        total_sheets = sum(l.sheet_count or 1 for l in active_layouts)
        done_sheets = 0
        for l in active_layouts:
            runs = json.loads(l.completed_runs) if l.completed_runs else []
            done_sheets += sum(1 for r in runs if r)
        pct = round((done_sheets / total_sheets) * 100) if total_sheets > 0 else 0

        if app.total_weight:
            total_weight += app.total_weight
        total_parts += app.total_parts_count or 0

        apps_data.append({
            "id": app.id,
            "order_name": app.order_name,
            "customer": cust.name if cust else "-",
            "material": app.steel_grade or app.material,
            "thickness": app.thickness,
            "status": app.status,
            "machine": machine,
            "total_parts": app.total_parts_count,
            "total_weight": app.total_weight,
            "layouts_count": len(active_layouts),
            "progress_pct": pct,
        })

    return {
        "group": {
            "id": group.id,
            "name": group.name,
            "created_at": group.created_at.isoformat() if group.created_at else None,
        },
        "applications": apps_data,
        "summary": {
            "total_apps": len(apps_data),
            "total_weight": total_weight,
            "total_parts": total_parts,
        }
    }


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
            "sheet_count": layout.sheet_count or 1,
            "completed_runs": json.loads(layout.completed_runs) if layout.completed_runs else [],
            "status": layout.status,
            "replaced": layout.status == "replaced",
            "merged_from": json.loads(layout.merged_from) if layout.merged_from else None,
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
            "status": app.status or "pending",
            "supply_material": app.supply_material,
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

    await db.execute(delete(DeficitRequest).where(DeficitRequest.application_id == app_id))
    await db.execute(delete(Notification).where(Notification.related_app_id == app_id))
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


@router.patch("/{app_id}/supply_material")
async def update_supply_material(
        app_id: int,
        value: str = Query(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if value == "true":
        app.supply_material = True
    elif value == "false":
        app.supply_material = False
    else:
        app.supply_material = None

    await db.commit()
    return {"status": "success"}


@router.patch("/{app_id}/comments")
async def update_application_comments(
        app_id: int,
        comments: str = Query(""),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR, UserRole.DIRECTOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    app.comments = comments
    await db.commit()
    return {"status": "success"}


@router.patch("/{app_id}/edit")
async def update_application(
        app_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if "customer_name" in body:
        customer = await get_or_create_customer(db, body["customer_name"])
        app.customer_id = customer.id

    if "material" in body:
        app.material = body["material"][:50] if body["material"] else app.material

    if "steel_grade" in body:
        app.steel_grade = body["steel_grade"][:50] if body["steel_grade"] else None

    if "machine_type" in body:
        mt = body["machine_type"]
        if mt in ("CNF", "FNF"):
            layouts_result = await db.execute(
                select(ApplicationLayout).where(
                    ApplicationLayout.application_id == app_id,
                    ApplicationLayout.status.in_(["active", None])
                )
            )
            for layout in layouts_result.scalars().all():
                layout.machine_type = mt

    await db.commit()
    return {"status": "success"}


@router.patch("/layouts/{layout_id}/toggle-run")
async def toggle_layout_run(
        layout_id: int,
        run_index: int = Query(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    result = await db.execute(select(ApplicationLayout).where(ApplicationLayout.id == layout_id))
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Раскладка не найдена")

    completed = []
    if layout.completed_runs:
        try:
            completed = json.loads(layout.completed_runs)
        except Exception:
            completed = []

    while len(completed) < layout.sheet_count:
        completed.append(False)

    if 0 <= run_index < len(completed):
        if completed[run_index]:
            for j in range(run_index, len(completed)):
                completed[j] = False
        else:
            completed[run_index] = True

    layout.completed_runs = json.dumps(completed)
    await db.flush()

    all_layouts_result = await db.execute(
        select(ApplicationLayout).where(ApplicationLayout.application_id == layout.application_id)
    )
    all_layouts = all_layouts_result.scalars().all()

    total_sheets = 0
    done_sheets = 0
    for l in all_layouts:
        runs = []
        if l.completed_runs:
            try:
                runs = json.loads(l.completed_runs)
            except Exception:
                runs = []
        while len(runs) < l.sheet_count:
            runs.append(False)
        total_sheets += l.sheet_count
        done_sheets += sum(1 for r in runs[:l.sheet_count] if r)

    app_result = await db.execute(select(Application).where(Application.id == layout.application_id))
    app = app_result.scalar_one_or_none()
    if app:
        if total_sheets > 0 and done_sheets == total_sheets:
            new_status = 'cut'
        elif done_sheets > 0:
            new_status = 'partially_cut'
        elif app.status in ('partially_cut', 'cut'):
            new_status = 'in_progress'
        else:
            new_status = app.status
        if new_status != app.status:
            app.status = new_status

    await db.commit()
    return {"status": "success", "completed_runs": completed, "app_status": app.status if app else None}


@router.patch("/{app_id}/status")
async def update_application_status(
        app_id: int,
        status: str = Query(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))
):
    if status not in ("pending", "approved", "rejected", "in_progress", "partially_cut", "cut"):
        raise HTTPException(status_code=400, detail="Невалидный статус")

    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    old_status = app.status
    app.status = status
    app.updated_by = user.id

    if status == "cut" and old_status != "cut":
        from datetime import datetime, timezone
        app.cut_at = datetime.now(timezone.utc)
        app.cut_by = user.id if user.role == UserRole.OPERATOR else None
    elif status != "cut" and old_status == "cut":
        app.cut_at = None
        app.cut_by = None

    # Уведомление для заказчика и админов
    if old_status != status:
        status_labels = {
            "pending": "В очереди", "approved": "В очереди", "rejected": "Отклонено",
            "in_progress": "В резке", "partially_cut": "Частично вырезано", "cut": "Вырезано"
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
            "pending": "В очереди", "approved": "В очереди", "rejected": "Отклонено",
            "in_progress": "В резке", "partially_cut": "Частично вырезано", "cut": "Вырезано"
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

    try:
        from app.services.cache import invalidate
        await invalidate("apps:")
    except Exception:
        pass

    if old_status != status:
        try:
            from app.main import manager
            notif_user_ids = []
            if app.customer_id:
                users_result = await db.execute(
                    select(User.id).where(User.customer_id == app.customer_id, User.role == UserRole.CUSTOMER)
                )
                notif_user_ids.extend([r[0] for r in users_result.all()])
            admins_result = await db.execute(
                select(User.id).where(User.role.in_([UserRole.ADMIN, UserRole.DIRECTOR]))
            )
            notif_user_ids.extend([r[0] for r in admins_result.all()])
            for uid in set(notif_user_ids):
                if uid != user.id:
                    await manager.send_to_user(uid, {
                        "type": "notification",
                        "message": msg
                    })
        except Exception:
            pass

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

    if app.customer_id:
        try:
            from app.main import manager
            users_result = await db.execute(
                select(User.id).where(User.customer_id == app.customer_id, User.role == UserRole.CUSTOMER)
            )
            for uid in [r[0] for r in users_result.all()]:
                await manager.send_to_user(uid, {
                    "type": "notification",
                    "message": msg
                })
        except Exception:
            pass

    return {"status": "success", "deficit_id": deficit.id}