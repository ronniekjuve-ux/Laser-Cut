import asyncio
from app.db.base import engine
from sqlalchemy import text

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'messages' AND column_name IN ('is_edited', 'is_deleted')"
        ))
        existing = {row[0] for row in result}
        if 'is_edited' not in existing:
            await conn.execute(text('ALTER TABLE messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE'))
            print('Added is_edited')
        else:
            print('is_edited already exists')
        if 'is_deleted' not in existing:
            await conn.execute(text('ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE'))
            print('Added is_deleted')
        else:
            print('is_deleted already exists')
        await conn.commit()

asyncio.run(main())
