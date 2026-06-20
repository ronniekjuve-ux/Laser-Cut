# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.db.base import get_db
from app.db.models import Feedback
from app.models.user import User, UserRole
from app.core.deps import require_role, get_current_user

router = APIRouter(prefix="/feedback", tags=["Feedback"])


@router.get("/")
async def list_feedback(
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    if user.role in (UserRole.ADMIN, UserRole.DIRECTOR):
        result = await db.execute(
            select(Feedback, User.username)
            .join(User, Feedback.user_id == User.id)
            .order_by(desc(Feedback.created_at))
        )
        rows = result.all()
        return [
            {
                "id": f.id,
                "user_id": f.user_id,
                "username": username,
                "type": f.type,
                "text": f.text,
                "status": f.status,
                "admin_response": f.admin_response,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f, username in rows
        ]
    else:
        result = await db.execute(
            select(Feedback).where(Feedback.user_id == user.id).order_by(desc(Feedback.created_at))
        )
        items = result.scalars().all()
        return [
            {
                "id": i.id,
                "user_id": i.user_id,
                "username": user.username,
                "type": i.type,
                "text": i.text,
                "status": i.status,
                "admin_response": i.admin_response,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in items
        ]


@router.post("/")
async def create_feedback(
        body: dict,
        db: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user)
):
    fb_type = body.get("type", "")
    text = body.get("text", "").strip()
    if fb_type not in ("complaint", "suggestion"):
        raise HTTPException(status_code=400, detail="Тип должен быть complaint или suggestion")
    if not text:
        raise HTTPException(status_code=400, detail="Текст обязателен")

    fb = Feedback(user_id=user.id, type=fb_type, text=text)
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {"status": "success", "id": fb.id}


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

    await db.commit()
    return {"status": "success"}
