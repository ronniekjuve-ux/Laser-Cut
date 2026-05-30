from fastapi import APIRouter, Depends
from app.models.user import User
from app.core.deps import get_current_user

router = APIRouter(prefix="/applications", tags=["Applications"])

@router.get("/")
async def get_applications(current_user: User = Depends(get_current_user)):
    return []  # Пока пусто, потом добавишь