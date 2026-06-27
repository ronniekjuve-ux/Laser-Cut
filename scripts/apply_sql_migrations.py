import sys
sys.path.insert(0, '/app')

import asyncio
from app.db.base import engine
from sqlalchemy import text

async def main():
    sql = """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
    """
    async with engine.begin() as conn:
        for stmt in sql.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                try:
                    await conn.execute(text(stmt))
                    print(f"OK: {stmt[:60]}...")
                except Exception as e:
                    print(f"Skip: {stmt[:60]}... ({e})")

asyncio.run(main())
