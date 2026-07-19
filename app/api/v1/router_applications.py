# -*- coding: utf-8 -*-
import json
import glob
import re
import shutil
import asyncio
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import joinedload, selectinload
from typing import Optional, List
from pathlib import Path
from app.db.base import get_db
from app.db.models import (
    Application, ApplicationLayout, ApplicationLayoutPart, Customer,
    User, UserRole, ApplicationStatus, ApplicationPriority,
    DeficitRequest, Notification, ChangeLog, OrderGroup,
    WarehouseItem, WarehouseMovement
)
from app.core.deps import get_current_user, require_role, get_customer_ids
from app.services.unified_parser import (
    extract_text,
    parse_application_text,
    parse_layout_text,
    merge_data,
    ApplicationData,
    extract_images,
    extract_layout_image,
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
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
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
            app.placed_parts_count = data.placed_parts_count
            app.ordered_parts_count = data.ordered_parts_count
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
                placed_parts_count=data.placed_parts_count,
                ordered_parts_count=data.ordered_parts_count,
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
            "images_count": len(detail_images),
            "placed_parts": data.placed_parts_count,
            "ordered_parts": data.ordered_parts_count,
            "parts_warning": (
                f"Размещено {data.placed_parts_count} деталей, заказано {data.ordered_parts_count} деталей. "
                "Количество не совпадает!"
            ) if (data.placed_parts_count is not None and data.ordered_parts_count is not None
                   and data.placed_parts_count != data.ordered_parts_count) else None
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка парсинга: {str(e)}")


@router.post("/{app_id}/layouts/upload")
async def upload_layout(
        app_id: int,
        file: UploadFile = File(...),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
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

        # === Image extraction: Word (DOC→HTML→GIF) preferred, LibreOffice fallback ===
        import asyncio
        layout_image_path = None
        saved_name = Path(file_path).stem.replace(" ", "_").replace(".", "_")
        dest_dir = IMAGE_DIR / f"layouts/{app.order_name}_{layout_code}"
        dest_dir.mkdir(parents=True, exist_ok=True)

        # 1. Try Word directly (works on Windows with MS Word installed)
        try:
            import pythoncom
            pythoncom.CoInitialize()
            import win32com.client
            import tempfile as _tmp
            with _tmp.TemporaryDirectory() as tmpdir:
                tmpdir = Path(tmpdir)
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                word.DisplayAlerts = 0
                try:
                    doc = word.Documents.Open(str(Path(file_path).absolute()))
                    html_path = tmpdir / f"{tmpdir.name}.html"
                    doc.SaveAs2(str(html_path), FileFormat=10)  # wdFormatHTML
                    doc.Close(False)
                finally:
                    word.Quit()

                await asyncio.sleep(0.5)

                # Find GIF in _files folder or root
                IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'}
                all_images = {}
                for d in tmpdir.glob("*_files"):
                    if d.is_dir():
                        for f in d.iterdir():
                            if f.is_file() and f.suffix.lower() in IMG_EXTS:
                                all_images[f.name] = f
                for f in tmpdir.iterdir():
                    if f.is_file() and f.suffix.lower() in IMG_EXTS:
                        if f.name not in all_images:
                            all_images[f.name] = f

                if all_images:
                    # Pick the largest image (main layout image)
                    best_name = max(all_images, key=lambda k: all_images[k].stat().st_size)
                    best_src = all_images[best_name]
                    dest_name = f"{saved_name}_{best_name}"
                    dest = dest_dir / dest_name
                    shutil.copy2(best_src, dest)
                    layout_image_path = f"/api/v1/images/layouts/{app.order_name}_{layout_code}/{dest_name}"
                    print(f"WORD_OK: {layout_image_path} ({dest.stat().st_size} bytes)")
            pythoncom.CoUninitialize()
        except ImportError:
            print("WORD_SKIP: win32com not available, trying auto_convert.py")
        except Exception as e:
            print(f"WORD_ERROR: {e}")

        # 2. Try local converter (.exe running on Windows host)
        if not layout_image_path:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=5) as client:
                    # Check if local converter is running
                    health_resp = await client.get("http://host.docker.internal:8001/health")
                    health_resp.raise_for_status()
                    # Convert via local converter
                    convert_resp = await client.post(
                        "http://host.docker.internal:8001/convert",
                        json={"path": file_path},
                        timeout=30
                    )
                    result = convert_resp.json()
                    if result.get('images'):
                        for img in result['images']:
                            if img.get('name', '').endswith(('.gif', '.png', '.jpg')):
                                src = IMAGE_DIR / img['name']
                                if src.exists():
                                    dest_name = img['name']
                                    dest = dest_dir / dest_name
                                    shutil.copy2(src, dest)
                                    layout_image_path = f"/api/v1/images/layouts/{app.order_name}_{layout_code}/{dest_name}"
                                    break
            except Exception:
                pass  # Local converter not available, continue

        # 3. If no Word image, wait for auto_convert.py (background process)
        if not layout_image_path:
            for wait in range(6):
                await asyncio.sleep(1)
                for ext in ['gif', 'png', 'jpg']:
                    pattern = f"{saved_name}_*.{ext}"
                    word_images = list(IMAGE_DIR.glob(pattern))
                    if word_images:
                        best = max(word_images, key=lambda f: f.stat().st_size)
                        layout_image_path = f"/api/v1/images/{best.name}"
                        print(f"AUTO_CONVERT_OK: {best.name}")
                        break
                if layout_image_path:
                    break

        # 4. Fallback to LibreOffice (known to lose curves, but better than nothing)
        if not layout_image_path:
            print(f"FALLBACK: LibreOffice (may lose curves)")
            layout_image_path = extract_layout_image(file_path, str(IMAGE_DIR), prefix=f"layouts/{app.order_name}_{layout_code}")
            if not layout_image_path:
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
            part_weight = part_data.weight

            part_key = normalize_name(part_data.name)
            part_image = detail_image_map.get(part_key)

            part = ApplicationLayoutPart(
                layout_id=layout.id,
                name=part_data.name,
                dx=part_data.dx,
                dy=part_data.dy,
                quantity=part_data.qty_layout,
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


@router.post("/{app_id}/reupload")
async def reupload_application(
        app_id: int,
        application_file: Optional[UploadFile] = File(None),
        layout_files: Optional[List[UploadFile]] = File(None),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(
        select(Application)
        .where(Application.id == app_id)
        .options(selectinload(Application.layouts).selectinload(ApplicationLayout.parts))
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    try:
        # --- Step 1: Re-upload application .doc ---
        if application_file and application_file.filename:
            if not application_file.filename.lower().endswith('.doc'):
                raise HTTPException(status_code=400, detail="Только .doc файлы")

            # Delete old application .doc files (not layout files)
            old_app_files = [
                f for f in glob.glob(f"{UPLOAD_DIR}/{app.order_name}*")
                if f.lower().endswith(('.doc', '.docx')) and '_layout_' not in f.lower()
            ]
            for f in old_app_files:
                try:
                    Path(f).unlink()
                except Exception:
                    pass

            # Save new file
            file_path = save_uploaded_file(application_file, app.order_name)

            # Parse
            text = extract_text(file_path)
            data = parse_application_text(text)

            if not data.order_name:
                data.order_name = app.order_name

            # Extract images
            detail_images = extract_images(file_path, str(IMAGE_DIR), prefix="applications", filter_dft=True)
            detail_image_map = {}
            if detail_images:
                for img_path, dft_name in detail_images:
                    key = normalize_name(dft_name)
                    if key:
                        detail_image_map[key] = img_path
            images_json = json.dumps(detail_image_map) if detail_image_map else None

            # Update application record
            app.material = data.material
            app.thickness = data.thickness
            app.total_weight = data.total_weight
            app.total_parts_count = len(data.parts)
            app.placed_parts_count = data.placed_parts_count
            app.ordered_parts_count = data.ordered_parts_count
            if detail_image_map:
                app.detail_images = images_json

            # Re-merge all layout parts with new application data
            for layout in app.layouts:
                await db.execute(
                    delete(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
                )

                # Find layout .doc file and re-parse
                layout_pattern = f"{UPLOAD_DIR}/{app.order_name}_layout_{layout.layout_code}*"
                layout_files_found = glob.glob(layout_pattern)
                if layout_files_found:
                    layout_text = extract_text(layout_files_found[0])
                    layout_data = parse_layout_text(layout_text, "")
                    merged_parts = merge_data(data, layout_data)

                    # Update layout metadata
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

                    # Re-create parts
                    for part_data in merged_parts:
                        part_key = normalize_name(part_data.name)
                        part_image = detail_image_map.get(part_key)
                        part = ApplicationLayoutPart(
                            layout_id=layout.id,
                            name=part_data.name,
                            dx=part_data.dx,
                            dy=part_data.dy,
                            quantity=part_data.qty_layout,
                            weight=part_data.weight,
                            image_path=part_image
                        )
                        db.add(part)

            # Reset progress since data changed
            for layout in app.layouts:
                layout.completed_runs = None

        # --- Step 2: Re-upload layout .doc files ---
        if layout_files:
            # Delete old layout files and records
            old_layout_files = glob.glob(f"{UPLOAD_DIR}/{app.order_name}_layout_*")
            for f in old_layout_files:
                try:
                    Path(f).unlink()
                except Exception:
                    pass

            # Delete old layout images
            for layout in app.layouts:
                if layout.layout_image:
                    img_path = Path(IMAGE_DIR) / layout.layout_image.lstrip('/')
                    try:
                        img_path.unlink()
                    except Exception:
                        pass

            # Delete old layouts and parts
            for layout in app.layouts:
                await db.execute(
                    delete(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == layout.id)
                )
            await db.execute(
                delete(ApplicationLayout).where(ApplicationLayout.application_id == app_id)
            )
            await db.flush()

            # Parse application data for merging
            app_data = ApplicationData()
            # Re-parse app .doc to get thickness and other data
            app_files = [
                f for f in glob.glob(f"{UPLOAD_DIR}/{app.order_name}*")
                if f.lower().endswith(('.doc', '.docx')) and '_layout_' not in f.lower()
            ]
            if app_files:
                app_text = extract_text(app_files[0])
                app_data = parse_application_text(app_text)
                # Update app record with parsed data
                if app_data.thickness > 0:
                    app.thickness = app_data.thickness
                if app_data.total_weight:
                    app.total_weight = app_data.total_weight
                if app_data.material and app_data.material != "Steel":
                    app.material = app_data.material

            # Upload each new layout file
            detail_image_map = {}
            if app.detail_images:
                try:
                    parsed = json.loads(app.detail_images)
                    if isinstance(parsed, dict):
                        detail_image_map = parsed
                except Exception:
                    pass

            for lf in layout_files:
                if not lf.filename or not lf.filename.lower().endswith('.doc'):
                    continue

                filename = lf.filename.lower()
                machine_type = "FNF" if "fnf" in filename else "CNF"
                code_match = re.search(r'(\d{3})', lf.filename)
                layout_code = code_match.group(1) if code_match else "001"

                file_path = save_uploaded_file(lf, f"{app.order_name}_layout_{layout_code}")

                layout_text = extract_text(file_path)
                layout_data = parse_layout_text(layout_text, lf.filename)

                # Extract layout image (high quality DOC→PDF→PNG)
                layout_image_path = extract_layout_image(file_path, str(IMAGE_DIR), prefix=f"layouts/{app.order_name}_{layout_code}")
                if not layout_image_path:
                    # Fallback на старый метод (HTML)
                    layout_images = extract_images(file_path, str(IMAGE_DIR), prefix=f"layouts/{app.order_name}_{layout_code}")
                    layout_image_path = layout_images[0] if layout_images else None

                # Merge
                merged_parts = merge_data(app_data, layout_data)

                # Create layout record
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

                # Create parts
                for part_data in merged_parts:
                    part_key = normalize_name(part_data.name)
                    part_image = detail_image_map.get(part_key)
                    part = ApplicationLayoutPart(
                        layout_id=layout.id,
                        name=part_data.name,
                        dx=part_data.dx,
                        dy=part_data.dy,
                        quantity=part_data.qty_layout,
                        weight=part_data.weight,
                        image_path=part_image
                    )
                    db.add(part)

            # Reset status
            app.status = "approved"

        await db.commit()

        try:
            from app.services.cache import invalidate
            await invalidate("apps:")
        except Exception:
            pass

        return {
            "status": "success",
            "message": "Файлы обновлены",
            "placed_parts": app_data.placed_parts_count if app_data else None,
            "ordered_parts": app_data.ordered_parts_count if app_data else None,
            "parts_warning": (
                f"Размещено {app_data.placed_parts_count} деталей, заказано {app_data.ordered_parts_count} деталей. "
                "Количество не совпадает!"
            ) if (app_data and app_data.placed_parts_count is not None and app_data.ordered_parts_count is not None
                   and app_data.placed_parts_count != app_data.ordered_parts_count) else None
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка перезагрузки: {str(e)}")


@router.get("/")
async def list_applications(
        tab: Optional[str] = Query(None),
        search: Optional[str] = None,
        page: int = Query(1, ge=1),
        limit: int = Query(50, ge=1, le=2000),
        customer_name: Optional[str] = None,
        material: Optional[str] = None,
        thickness: Optional[str] = None,
        supply_material: Optional[str] = None,
        priority: Optional[str] = None,
        machine: Optional[str] = None,
        status: Optional[str] = None,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from app.services.cache import get_redis, cache_key
    r = await get_redis()
    ckey = cache_key("apps", tab, search, page, limit, user.id, customer_name, material, thickness, supply_material, priority, machine)
    try:
        cached = await r.get(ckey)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    # Если заказчик — только свои заявки
    customer_ids = await get_customer_ids(user, db)

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
    if customer_ids is not None:
        if not customer_ids:
            return {"items": [], "total": 0, "page": page, "pages": 0, "filter_values": {}}
        query = query.where(Application.customer_id.in_(customer_ids))

    if tab == "applications":
        query = query.where(Application.status.in_(["pending", "rejected"]))
    elif tab == "orders":
        query = query.where(Application.status.notin_(["pending", "rejected"]))

    # Server-side column filters
    if customer_name:
        query = query.where(Customer.name.ilike(f"%{customer_name}%"))
    if material:
        query = query.where(Application.steel_grade.ilike(f"%{material}%"))
    if thickness:
        try:
            query = query.where(Application.thickness == float(thickness))
        except ValueError:
            pass
    if supply_material is not None and supply_material != '':
        val = supply_material.lower() in ('true', 'да', '1', 'yes')
        query = query.where(Application.supply_material == val)
    if priority:
        query = query.where(Application.priority == priority)
    if machine:
        # Convert display names to DB values: "станок 1" → "CNF", "станок 2" → "FNF"
        machine_upper = machine.upper()
        if "СТАНОК 1" in machine_upper or "CNF" in machine_upper:
            machine_db = "CNF"
        elif "СТАНОК 2" in machine_upper or "FNF" in machine_upper:
            machine_db = "FNF"
        else:
            machine_db = machine
        machine_subq = select(ApplicationLayout.application_id).where(
            ApplicationLayout.machine_type.ilike(f"%{machine_db}%")
        ).distinct().subquery()
        query = query.where(Application.id.in_(select(machine_subq.c.application_id)))
    if status:
        query = query.where(Application.status == status)

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

        total_sheets = sum(l.sheet_count or 1 for l in active_layouts)
        first_sheet_size = f"{first_layout.sheet_w}x{first_layout.sheet_h}" if first_layout else None
        first_layout_image = first_layout.layout_image if first_layout else None

        # All active layouts for carousel
        all_active_layouts_data = []
        for al in active_layouts:
            all_active_layouts_data.append({
                "id": al.id,
                "layout_code": al.layout_code,
                "layout_image": al.layout_image,
                "sheet_size": f"{al.sheet_w}x{al.sheet_h}",
                "sheet_count": al.sheet_count or 1,
                "completed_runs": json.loads(al.completed_runs) if al.completed_runs else [],
                "warehouse_item_id": al.warehouse_item_id,
                "warehouse_bindings": json.loads(al.warehouse_bindings) if al.warehouse_bindings else {},
            })

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
            "layout_image": first_layout_image,
            "sheet_size": first_sheet_size,
            "sheet_count": total_sheets,
            "layouts": all_active_layouts_data,
            "cut_at": app.cut_at.isoformat() if app.cut_at else None,
            "cut_by_id": app.cut_by,
            "matched_parts": matched_parts,
            "created_at": app.created_at,
            "group_id": app.group_id,
            "group_name": app.group.name if app.group else None,
            "warehouse_item_id": app.warehouse_item_id,
            "sheets_used": app.sheets_used,
            "warehouse_deducted": app.warehouse_deducted or False,
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

    # Unique filter values across ALL matching apps (not just current page)
    filter_values = {}
    try:
        base_for_filters = query.with_only_columns(Application.id)
        ids_result = await db.execute(base_for_filters)
        all_ids = [r[0] for r in ids_result.all()]
        if all_ids:
            # Get customers
            cust_result = await db.execute(
                select(Customer.name).join(Application, Application.customer_id == Customer.id).where(Application.id.in_(all_ids)).distinct()
            )
            filter_values["customer"] = sorted([r[0] for r in cust_result.all() if r[0]])
            # Get materials
            mat_result = await db.execute(
                select(Application.steel_grade).where(Application.id.in_(all_ids), Application.steel_grade.isnot(None)).distinct()
            )
            filter_values["material"] = sorted([r[0] for r in mat_result.all() if r[0]])
            # Get thicknesses
            th_result = await db.execute(
                select(Application.thickness).where(Application.id.in_(all_ids), Application.thickness.isnot(None)).distinct()
            )
            filter_values["thickness"] = sorted([str(r[0]) for r in th_result.all() if r[0]])
            # Get priorities
            pr_result = await db.execute(
                select(Application.priority).where(Application.id.in_(all_ids), Application.priority.isnot(None)).distinct()
            )
            filter_values["priority"] = sorted([r[0] for r in pr_result.all() if r[0]])
    except Exception:
        pass

    return {
        "items": enriched,
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total > 0 else 0,
        "filter_values": filter_values,
    }


@router.get("/export")
async def export_applications_xlsx(
        tab: Optional[str] = Query(None),
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    from fastapi.responses import StreamingResponse
    from app.services.exporters import export_applications

    query = select(Application, Customer).join(Customer, Application.customer_id == Customer.id, isouter=True)
    export_customer_ids = await get_customer_ids(user, db)
    if export_customer_ids is not None:
        if not export_customer_ids:
            from fastapi.responses import StreamingResponse
            return StreamingResponse(iter([b""]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        query = query.where(Application.customer_id.in_(export_customer_ids))
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
        limit: int = Query(50, ge=1, le=2000),
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
    if user.role == UserRole.CUSTOMER:
        deficit_cust_ids = await get_customer_ids(user, db)
        if deficit_cust_ids is not None:
            cust_result = await db.execute(select(Customer.name).where(Customer.id.in_(deficit_cust_ids)))
            cust_names = [r[0] for r in cust_result.all()]
            if cust_names:
                query = query.where(DeficitRequest.customer_name.in_(cust_names))
            else:
                return []

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

    # Extract layout image (high quality DOC→PDF→PNG)
    layout_image_path = extract_layout_image(file_path, str(IMAGE_DIR), prefix=f"layouts/merge_{new_app.id}_{layout_code}")
    if not layout_image_path:
        # Fallback на старый метод (HTML)
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
        part_weight = part_data.weight
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
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
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
    total_types = 0
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

        # Total parts = ordered or placed count (total quantity, not unique types)
        app_total_parts = app.ordered_parts_count or app.placed_parts_count or 0
        # If still 0, sum from layout parts
        if app_total_parts == 0:
            for l in active_layouts:
                parts_result = await db.execute(
                    select(ApplicationLayoutPart).where(ApplicationLayoutPart.layout_id == l.id)
                )
                layout_parts = parts_result.scalars().all()
                app_total_parts += sum(p.quantity for p in layout_parts)

        # Unique types from total_parts_count
        app_types_count = app.total_parts_count or 0

        total_parts += app_total_parts
        total_types += app_types_count

        apps_data.append({
            "id": app.id,
            "order_name": app.order_name,
            "customer": cust.name if cust else "-",
            "material": app.steel_grade or app.material,
            "thickness": app.thickness,
            "status": app.status,
            "machine": machine,
            "total_parts": app_total_parts,
            "types_count": app_types_count,
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
            "total_types": total_types,
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
            "warehouse_item_id": layout.warehouse_item_id,
            "warehouse_bindings": json.loads(layout.warehouse_bindings) if layout.warehouse_bindings else {},
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
            "placed_parts": app.placed_parts_count,
            "ordered_parts": app.ordered_parts_count,
            "total_weight": app.total_weight,
            "comments": app.comments,
            "detail_images": app.detail_images,
            "status": app.status or "pending",
            "supply_material": app.supply_material,
            "created_at": app.created_at,
            "warehouse_item_id": app.warehouse_item_id,
            "sheets_used": app.sheets_used,
            "warehouse_deducted": app.warehouse_deducted or False,
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

    old_priority = app.priority
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
        old_value=priority_labels.get(old_priority, old_priority or "Нет"),
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
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
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

    was_checked = completed[run_index] if 0 <= run_index < len(completed) else False

    if 0 <= run_index < len(completed):
        if completed[run_index]:
            for j in range(run_index, len(completed)):
                completed[j] = False
        else:
            completed[run_index] = True

    layout.completed_runs = json.dumps(completed)

    # Per-run warehouse deduction: deduct 1 sheet when marking as cut, return when unmarking
    from datetime import datetime, timezone

    # Parse per-run bindings
    run_bindings = {}
    if layout.warehouse_bindings:
        try:
            run_bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
        except Exception:
            run_bindings = {}

    bound_wh_id = run_bindings.get(str(run_index))
    if bound_wh_id:
        wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == bound_wh_id))
        wh_item = wh_result.scalar_one_or_none()
        if wh_item:
            if not was_checked and completed[run_index]:
                # Marking sheet as cut — deduct from warehouse
                if wh_item.sheet_count >= 1:
                    wh_item.sheet_count -= 1
                    wh_item.last_deducted_at = datetime.now(timezone.utc)
                    db.add(WarehouseMovement(
                        warehouse_item_id=wh_item.id,
                        application_id=layout.application_id,
                        quantity_change=-1,
                        movement_type="deduction",
                        reason=f"Списание при резке раскладки {layout.layout_code} (рез #{run_index+1})",
                        created_by=user.id,
                    ))
                    # Remove binding after deduction
                    run_bindings.pop(str(run_index), None)
                    layout.warehouse_bindings = json.dumps(run_bindings) if run_bindings else None
            elif was_checked and not completed[run_index]:
                # Unmarking — return sheet to warehouse
                wh_item.sheet_count += 1
                db.add(WarehouseMovement(
                    warehouse_item_id=wh_item.id,
                    application_id=layout.application_id,
                    quantity_change=1,
                    movement_type="return",
                    reason=f"Возврат при отмене резки раскладки {layout.layout_code} (рез #{run_index+1})",
                    created_by=user.id,
                ))

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

        # Автосписание со склада при завершении резки
        # 1. Legacy per-layout warehouse_item_id
        if app.warehouse_item_id and not app.warehouse_deducted:
            wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == app.warehouse_item_id))
            wh_item = wh_result.scalar_one_or_none()
            if wh_item:
                layouts_result = await db.execute(
                    select(ApplicationLayout).where(
                        ApplicationLayout.application_id == app.id,
                        ApplicationLayout.status == "active",
                    )
                )
                active_layouts = layouts_result.scalars().all()

                sheets_to_deduct = 0
                if active_layouts and wh_item.sheet_w and wh_item.sheet_h:
                    wh_area = wh_item.sheet_w * wh_item.sheet_h
                    if wh_area > 0:
                        import math
                        total_layout_area = sum(
                            (l.sheet_w or 0) * (l.sheet_h or 0) * (l.sheet_count or 1)
                            for l in active_layouts
                        )
                        sheets_to_deduct = math.ceil(total_layout_area / wh_area)
                elif app.sheets_used:
                    sheets_to_deduct = app.sheets_used

                if sheets_to_deduct > 0 and wh_item.sheet_count >= sheets_to_deduct:
                    wh_item.sheet_count -= sheets_to_deduct
                    wh_item.last_deducted_at = datetime.now(timezone.utc)
                    db.add(WarehouseMovement(
                        warehouse_item_id=wh_item.id,
                        application_id=app.id,
                        quantity_change=-sheets_to_deduct,
                        movement_type="deduction",
                        reason=f"Автосписание при завершении резки: заказ #{app.id} «{app.order_name}»",
                        created_by=user.id,
                    ))
                    app.sheets_used = sheets_to_deduct
                    app.warehouse_deducted = True

        # 2. Per-run warehouse_bindings: deduct bound sheets
        layouts_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.application_id == app.id,
                ApplicationLayout.status == "active",
            )
        )
        for layout in layouts_result.scalars().all():
            if not layout.warehouse_bindings:
                continue
            try:
                bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
                runs = json.loads(layout.completed_runs) if layout.completed_runs else []
            except Exception:
                continue
            for ri, bid in bindings.items():
                ri_int = int(ri)
                # Only deduct if run is marked as cut
                if ri_int < len(runs) and runs[ri_int]:
                    wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == bid))
                    wh_item = wh_result.scalar_one_or_none()
                    if wh_item and (wh_item.sheet_count or 0) >= 1:
                        wh_item.sheet_count -= 1
                        wh_item.last_deducted_at = datetime.now(timezone.utc)
                        db.add(WarehouseMovement(
                            warehouse_item_id=wh_item.id,
                            application_id=app.id,
                            quantity_change=-1,
                            movement_type="deduction",
                            reason=f"Автосписание при завершении резки: {layout.layout_code} (рез #{ri_int+1})",
                            created_by=user.id,
                        ))
            # Clear bindings after deduction
            layout.warehouse_bindings = None
    elif status != "cut" and old_status == "cut":
        app.cut_at = None
        app.cut_by = None

        # Автовозврат на склад при отмене статуса "cut"
        if app.warehouse_item_id and app.sheets_used and app.warehouse_deducted:
            wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == app.warehouse_item_id))
            wh_item = wh_result.scalar_one_or_none()
            if wh_item:
                wh_item.sheet_count += app.sheets_used
                db.add(WarehouseMovement(
                    warehouse_item_id=wh_item.id,
                    application_id=app.id,
                    quantity_change=app.sheets_used,
                    movement_type="return",
                    reason=f"Автовозврат при отмене резки: заказ #{app.id} «{app.order_name}»",
                    created_by=user.id,
                ))
                app.warehouse_deducted = False
                app.sheets_used = None
                app.warehouse_item_id = None

    # Sync completed_runs with status change
    if old_status != status:
        layouts_result = await db.execute(
            select(ApplicationLayout).where(ApplicationLayout.application_id == app_id)
        )
        all_layouts = layouts_result.scalars().all()

        for layout in all_layouts:
            runs = []
            if layout.completed_runs:
                try:
                    runs = json.loads(layout.completed_runs)
                except Exception:
                    runs = []
            while len(runs) < layout.sheet_count:
                runs.append(False)

            if status == "cut":
                runs = [True] * layout.sheet_count
            elif status == "approved":
                runs = [False] * layout.sheet_count
            elif status == "partially_cut":
                last_done = -1
                for i in range(len(runs) - 1, -1, -1):
                    if runs[i]:
                        last_done = i
                        break
                if last_done >= 0:
                    runs[last_done] = False
                else:
                    runs[0] = True

            layout.completed_runs = json.dumps(runs[:layout.sheet_count])

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
        msg = f"Заказ #{app.id} «{app.order_name}»{cust_name} ({order_date}): «{old_label}» → «{new_label}» ({user.username})"

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
        msg += f" — заказ #{app.id} «{app.order_name}» ({order_date})"
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


# === Warehouse binding ===

@router.patch("/{app_id}/warehouse")
async def bind_warehouse(
        app_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    warehouse_item_id = body.get("warehouse_item_id")
    sheets_used = body.get("sheets_used")
    layout_id = body.get("layout_id")

    if warehouse_item_id is None:
        app.warehouse_item_id = None
        app.sheets_used = None
        # Clear layout bindings too
        layouts_result = await db.execute(
            select(ApplicationLayout).where(ApplicationLayout.application_id == app_id)
        )
        for layout in layouts_result.scalars().all():
            layout.warehouse_item_id = None
            layout.layout_sheets_used = None
        await db.commit()
        return {"status": "success"}

    if not sheets_used or sheets_used <= 0:
        raise HTTPException(status_code=400, detail="Укажите количество листов")

    wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == warehouse_item_id))
    wh_item = wh_result.scalar_one_or_none()
    if not wh_item:
        raise HTTPException(status_code=404, detail="Позиция на складе не найдена")

    app.warehouse_item_id = warehouse_item_id
    app.sheets_used = sheets_used

    # Bind to specific layout if specified
    if layout_id:
        layout_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.id == layout_id,
                ApplicationLayout.application_id == app_id
            )
        )
        layout = layout_result.scalar_one_or_none()
        if layout:
            layout.warehouse_item_id = warehouse_item_id
            layout.layout_sheets_used = sheets_used

    await db.commit()
    return {"status": "success"}


@router.post("/{app_id}/cancel-deduct")
async def cancel_deduct(
        app_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if not app.warehouse_deducted:
        raise HTTPException(status_code=400, detail="Списание не было выполнено")

    if app.warehouse_item_id and app.sheets_used:
        from datetime import datetime, timezone
        wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == app.warehouse_item_id))
        wh_item = wh_result.scalar_one_or_none()
        if wh_item:
            wh_item.sheet_count += app.sheets_used
            db.add(WarehouseMovement(
                warehouse_item_id=wh_item.id,
                application_id=app.id,
                quantity_change=app.sheets_used,
                movement_type="return",
                reason=f"Ручной возврат: заказ #{app.id} «{app.order_name}»",
                created_by=user.id,
            ))

    app.warehouse_deducted = False
    app.sheets_used = None
    app.warehouse_item_id = None
    await db.commit()
    return {"status": "success"}


@router.get("/{app_id}/warehouse")
async def get_app_warehouse(
        app_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR))
):
    result = await db.execute(select(Application).where(Application.id == app_id))
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    wh_info = None
    if app.warehouse_item_id:
        wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == app.warehouse_item_id))
        wh_item = wh_result.scalar_one_or_none()
        if wh_item:
            wh_info = {
                "id": wh_item.id,
                "metal": wh_item.metal,
                "grade": wh_item.grade,
                "size": wh_item.size or (f"{int(wh_item.sheet_w)}x{int(wh_item.sheet_h)}" if wh_item.sheet_w and wh_item.sheet_h else ""),
                "sheet_count": wh_item.sheet_count,
            }

    return {
        "warehouse_item_id": app.warehouse_item_id,
        "sheets_used": app.sheets_used,
        "warehouse_deducted": app.warehouse_deducted or False,
        "warehouse_item": wh_info,
    }


@router.patch("/layouts/{layout_id}/warehouse")
async def bind_layout_warehouse(
        layout_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(select(ApplicationLayout).where(ApplicationLayout.id == layout_id))
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Раскладка не найдена")

    warehouse_item_id = body.get("warehouse_item_id")

    if warehouse_item_id is None:
        layout.warehouse_item_id = None
        layout.layout_sheets_used = None
        await db.commit()
        return {"status": "success"}

    wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == warehouse_item_id))
    wh_item = wh_result.scalar_one_or_none()
    if not wh_item:
        raise HTTPException(status_code=404, detail="Позиция на складе не найдена")

    layout.warehouse_item_id = warehouse_item_id
    await db.commit()
    return {"status": "success"}


@router.patch("/layouts/{layout_id}/bind-run")
async def bind_layout_run(
        layout_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    run_index = body.get("run_index")
    warehouse_item_id = body.get("warehouse_item_id")

    if run_index is None:
        raise HTTPException(status_code=400, detail="run_index обязателен")

    result = await db.execute(select(ApplicationLayout).where(ApplicationLayout.id == layout_id))
    layout = result.scalar_one_or_none()
    if not layout:
        raise HTTPException(status_code=404, detail="Раскладка не найдена")

    # Parse existing bindings
    bindings = {}
    if layout.warehouse_bindings:
        try:
            bindings = json.loads(layout.warehouse_bindings) if isinstance(layout.warehouse_bindings, str) else layout.warehouse_bindings
        except Exception:
            bindings = {}

    # Unbind
    if warehouse_item_id is None:
        bindings.pop(str(run_index), None)
        layout.warehouse_bindings = json.dumps(bindings) if bindings else None
        await db.commit()
        return {"status": "success", "warehouse_bindings": bindings}

    # Validate warehouse item exists and has stock
    wh_result = await db.execute(select(WarehouseItem).where(WarehouseItem.id == warehouse_item_id))
    wh_item = wh_result.scalar_one_or_none()
    if not wh_item:
        raise HTTPException(status_code=404, detail="Позиция на складе не найдена")
    if wh_item.sheet_count < 1:
        raise HTTPException(status_code=400, detail="Нет листов на складе")

    # Check reservation: if this item is bound to another uncut run, block
    old_binding = bindings.get(str(run_index))
    if old_binding != warehouse_item_id:
        layouts_result = await db.execute(
            select(ApplicationLayout).where(
                ApplicationLayout.id != layout_id,
                ApplicationLayout.status == "active"
            )
        )
        for other_layout in layouts_result.scalars().all():
            if other_layout.warehouse_bindings:
                try:
                    other_bindings = json.loads(other_layout.warehouse_bindings) if isinstance(other_layout.warehouse_bindings, str) else other_layout.warehouse_bindings
                    for ri, bid in other_bindings.items():
                        if bid == warehouse_item_id:
                            other_runs = json.loads(other_layout.completed_runs) if other_layout.completed_runs else []
                            if int(ri) < len(other_runs) and not other_runs[int(ri)]:
                                raise HTTPException(
                                    status_code=400,
                                    detail=f"Лист уже зарезервирован раскладкой {other_layout.layout_code} (рез #{int(ri)+1})"
                                )
                except HTTPException:
                    raise
                except Exception:
                    pass

    # Area validation (warning only)
    area_ok = True
    if wh_item.sheet_w and wh_item.sheet_h and layout.sheet_w and layout.sheet_h:
        wh_area = wh_item.sheet_w * wh_item.sheet_h
        layout_area = layout.sheet_w * layout.sheet_h
        if wh_area < layout_area:
            area_ok = False

    # Bind
    bindings[str(run_index)] = warehouse_item_id
    layout.warehouse_bindings = json.dumps(bindings)
    await db.commit()

    return {
        "status": "success",
        "warehouse_bindings": bindings,
        "area_warning": not area_ok
    }