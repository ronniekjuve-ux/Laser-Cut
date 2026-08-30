import sys
sys.path.insert(0, '/app')

import asyncio
from app.db.base import engine
from sqlalchemy import text

async def main():
    async with engine.connect() as conn:
        # Check if alembic_version table exists
        result = await conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version')"
        ))
        if not result.scalar():
            print('alembic_version table does not exist, skipping cleanup')
            return

        result = await conn.execute(text('SELECT version_num FROM alembic_version'))
        versions = result.fetchall()
        print('Current alembic versions:', versions)

        await conn.execute(text("DELETE FROM alembic_version WHERE version_num = 'f3b98e7da67a'"))
        await conn.commit()
        print('Deleted orphan revision (if existed)')

        result = await conn.execute(text('SELECT version_num FROM alembic_version'))
        versions = result.fetchall()
        print('After cleanup:', versions)

asyncio.run(main())
