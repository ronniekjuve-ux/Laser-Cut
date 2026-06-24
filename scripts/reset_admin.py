import sys
sys.path.insert(0, '/app')

import asyncio
from app.core.security import get_password_hash
from app.db.base import engine
from sqlalchemy import text

async def main():
    hashed = get_password_hash('admin123')
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET password_hash = :h WHERE username = :u"), {"h": hashed, "u": "admin"})
        result = await conn.execute(text("SELECT username, password_hash FROM users WHERE username = :u"), {"u": "admin"})
        row = result.fetchone()
        print(f"Updated: {row[0]}, hash prefix: {row[1][:15]}")

asyncio.run(main())
