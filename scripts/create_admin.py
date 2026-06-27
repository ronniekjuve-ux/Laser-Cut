import sys
sys.path.insert(0, '/app')

import asyncio
from app.core.security import get_password_hash
from app.db.base import engine
from sqlalchemy import text

async def main():
    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
        )
        if result.fetchone():
            print("User 'admin' already exists, skipping.")
            return

        hashed = get_password_hash('admin')
        await conn.execute(
            text("INSERT INTO users (username, email, password_hash, role, status) VALUES (:u, :e, :p, :r, :s)"),
            {"u": "admin", "e": "admin@laser-cut.pro", "p": hashed, "r": "admin", "s": "active"}
        )
        print("User 'admin' created successfully.")

asyncio.run(main())
