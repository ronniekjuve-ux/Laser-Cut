# -*- coding: utf-8 -*-
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Подключение к БД (замени пароль на свой)
engine = create_engine("postgresql+asyncpg://postgres:postgres@localhost:5432/laser_cut")

async def add_columns():
    async with engine.connect() as conn:
        await conn.execute(text("""
            ALTER TABLE applications ADD COLUMN IF NOT EXISTS detail_images TEXT;
        """))
        await conn.execute(text("""
            ALTER TABLE layouts ADD COLUMN IF NOT EXISTS layout_image VARCHAR(255);
        """))
        await conn.commit()
        print("✅ Колонки добавлены!")

if __name__ == "__main__":
    import asyncio
    asyncio.run(add_columns())