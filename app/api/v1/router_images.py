from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import os

router = APIRouter(prefix="/images", tags=["Images"])

IMAGES_DIR = Path("/app/data/images")


@router.get("/{order_name}/{filename}")
async def get_image(order_name: str, filename: str):
    """Получить изображение для конкретной заявки"""
    file_path = IMAGES_DIR / order_name / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    # Определяем content-type по расширению
    content_type = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.emf': 'image/emf',
    }.get(file_path.suffix.lower(), 'application/octet-stream')

    return FileResponse(file_path, media_type=content_type)


@router.get("/{order_name}")
async def list_images(order_name: str):
    """Список всех изображений для заявки"""
    order_dir = IMAGES_DIR / order_name

    if not order_dir.exists():
        return []

    return [
        {
            "filename": f.name,
            "url": f"/api/v1/images/{order_name}/{f.name}"
        }
        for f in order_dir.iterdir()
        if f.is_file() and f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']
    ]