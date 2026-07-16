# -*- coding: utf-8 -*-
"""Ensure password_plain column and user_customers table exist."""
import asyncio
import os

async def ensure():
    import asyncpg
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        print("DATABASE_URL not set, skipping")
        return
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")

    conn = await asyncpg.connect(dsn)
    try:
        exists = await conn.fetchval("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_customers')")
        if not exists:
            await conn.execute("CREATE TABLE user_customers (user_id INTEGER REFERENCES users(id), customer_id INTEGER REFERENCES customers(id), PRIMARY KEY (user_id, customer_id))")
            await conn.execute("INSERT INTO user_customers (user_id, customer_id) SELECT id, customer_id FROM users WHERE customer_id IS NOT NULL ON CONFLICT DO NOTHING")
            print("Created user_customers table")
        else:
            print("user_customers already exists")

        col = await conn.fetchval("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password_plain'")
        if col is None:
            await conn.execute("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)")
            print("Added password_plain column")
        else:
            print("password_plain already exists")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(ensure())
