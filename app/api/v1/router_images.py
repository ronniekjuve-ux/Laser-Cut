# -*- coding: utf-8 -*-
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter(prefix="/images", tags=["Images"])

IMAGES_DIR = Path("/app/data/images")


@router.get("/{full_path:path}")
async def get_image(full_path: str):
    """Получить изображение по полному пути от images/"""
    file_path = IMAGES_DIR / full_path

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Изображение не найдено")

    content_type = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.emf': 'image/emf',
        '.svg': 'image/svg+xml',
    }.get(file_path.suffix.lower(), 'application/octet-stream')

    return FileResponse(file_path, media_type=content_type)