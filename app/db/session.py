from app.db.base import AsyncSession
from typing import AsyncGenerator

async def get_db() -> AsyncGenerator:
    async with AsyncSession() as session:
        yield session