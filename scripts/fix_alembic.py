import asyncio
from app.db.base import engine
from sqlalchemy import text

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(text('SELECT version_num FROM alembic_version'))
        versions = result.fetchall()
        print('Current alembic versions:', versions)
        await conn.execute(text("DELETE FROM alembic_version WHERE version_num = 'f3b98e7da67a'"))
        await conn.commit()
        print('Deleted orphan revision')
        result = await conn.execute(text('SELECT version_num FROM alembic_version'))
        versions = result.fetchall()
        print('After cleanup:', versions)

asyncio.run(main())
