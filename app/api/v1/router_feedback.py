# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pathlib import Path
from app.db.base import get_db
from app.db.models import Feedback, Notification
from app.models.user import User, UserRole
from app.core.deps import require_role, get_current_user

router = APIRouter(prefix="/feedback", tags=["Feedback"])

UPLOAD_DIR = Path("/app/data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/")
async def list_feedback(
        page: int = 1,
        limit: int = 15,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    sort_map = {
        "type": Feedback.type,
        "username": User.username,
        "status": Feedback.status,
        "created_at": Feedback.created_at,
    }
    sort_col = sort_map.get(sort_by, Feedback.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()

    if user.role in (UserRole.ADMIN, UserRole.DIRECTOR):
        base = select(Feedback, User.username).join(User, Feedback.user_id == User.id)
        count_result = await db.execute(select(Feedback.id))
        total = len(count_result.all())
        result = await db.execute(base.order_by(order).offset((page - 1) * limit).limit(limit))
        rows = result.all()
        return {
            "items": [
                {
                    "id": f.id,
                    "user_id": f.user_id,
                    "username": username,
                    "type": f.type,
                    "text": f.text,
                    "image_url": f.image_url,
                    "status": f.status,
                    "admin_response": f.admin_response,
                    "admin_response_image": f.admin_response_image,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
                for f, username in rows
            ],
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit,
        }
    else:
        base = select(Feedback).where(Feedback.user_id == user.id)
        count_result = await db.execute(select(Feedback.id).where(Feedback.user_id == user.id))
        total = len(count_result.all())
        result = await db.execute(base.order_by(order).offset((page - 1) * limit).limit(limit))
        items = result.scalars().all()
        return {
            "items": [
                {
                    "id": i.id,
                    "user_id": i.user_id,
                    "username": user.username,
                    "type": i.type,
                    "text": i.text,
                    "image_url": i.image_url,
                    "status": i.status,
                    "admin_response": i.admin_response,
                    "admin_response_image": i.admin_response_image,
                    "created_at": i.created_at.isoformat() if i.created_at else None,
                }
                for i in items
            ],
            "total": total,
            "page": page,
            "pages": (total + limit - 1) // limit,
        }


@router.post("/")
async def create_feedback(
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    fb_type = body.get("type", "")
    text = body.get("text", "").strip()
    image_url = body.get("image_url")
    if fb_type not in ("complaint", "suggestion"):
        raise HTTPException(status_code=400, detail="Тип должен быть complaint или suggestion")
    if not text:
        raise HTTPException(status_code=400, detail="Текст обязателен")

    fb = Feedback(user_id=user.id, type=fb_type, text=text, image_url=image_url)
    db.add(fb)
    await db.flush()

    type_label = 'жалоба' if fb_type == 'complaint' else 'предложение'
    msg = f'Новый отзыв ({type_label}) от {user.username}'

    admins_result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN)
    )
    for admin_user in admins_result.scalars().all():
        db.add(Notification(user_id=admin_user.id, type="feedback", message=msg))

    await db.commit()
    await db.refresh(fb)
    return {"status": "success", "id": fb.id}


@router.post("/upload")
async def upload_feedback_image(
        file: UploadFile = File(...),
        user: User = Depends(get_current_user)
):
    safe_name = f"feedback_{user.id}_{file.filename}"
    file_path = UPLOAD_DIR / safe_name
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    return {"url": "/api/v1/feedback/file/" + safe_name}


@router.get("/file/{filename:path}")
async def get_feedback_file(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    content_type = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.bmp': 'image/bmp',
    }.get(file_path.suffix.lower(), 'application/octet-stream')
    return FileResponse(file_path, media_type=content_type)


@router.delete("/{fb_id}")
async def delete_feedback(
        fb_id: int,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    result = await db.execute(select(Feedback).where(Feedback.id == fb_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Отзыв не найден")
    if fb.user_id != user.id and user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(status_code=403, detail="Нет прав на удаление")
    await db.delete(fb)
    await db.commit()
    return {"status": "success"}


@router.patch("/{fb_id}")
async def update_feedback(
        fb_id: int,
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(require_role(UserRole.ADMIN, UserRole.DIRECTOR))
):
    result = await db.execute(select(Feedback).where(Feedback.id == fb_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Отзыв не найден")

    if "status" in body:
        fb.status = body["status"]
    if "admin_response" in body:
        fb.admin_response = body["admin_response"]
    if "admin_response_image" in body:
        fb.admin_response_image = body["admin_response_image"]
    if "admin_response" in body or "admin_response_image" in body:
        msg = f'Администратор ответил на ваш отзыв'
        db.add(Notification(user_id=fb.user_id, type="feedback_response", message=msg))

    await db.commit()

    try:
        from app.main import manager
        await manager.broadcast({
            "type": "notification",
            "message": f"Отзыв #{fb_id} обновлён"
        })
    except Exception:
        pass

    return {"status": "success"}
