import sys
sys.path.insert(0, '/app')

import asyncio
from app.db.base import engine
from sqlalchemy import text

MIGRATIONS = [
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);
    """,
    """
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
    """,
    """
    CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        related_app_id INTEGER REFERENCES applications(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    """,
]

async def main():
    async with engine.begin() as conn:
        for i, stmt in enumerate(MIGRATIONS):
            try:
                await conn.execute(text(stmt))
                print(f"OK migration {i+1}: {stmt.strip()[:60]}...")
            except Exception as e:
                print(f"Skip migration {i+1}: {stmt.strip()[:60]}... ({e})")

asyncio.run(main())
