# -*- coding: utf-8 -*-
"""Ensure password_plain column and user_customers table exist.
Uses raw asyncpg connection — no app imports, no model loading."""
import asyncio
import os

async def ensure():
    import asyncpg
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        print("DATABASE_URL not set, skipping schema ensure")
        return

    conn = await asyncpg.connect(dsn)
    try:
        # 1. Ensure user_customers table
        exists = await conn.fetchval(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_customers')"
        )
        if not exists:
            await conn.execute("""
                CREATE TABLE user_customers (
                    user_id INTEGER REFERENCES users(id),
                    customer_id INTEGER REFERENCES customers(id),
                    PRIMARY KEY (user_id, customer_id)
                )
            """)
            await conn.execute("""
                INSERT INTO user_customers (user_id, customer_id)
                SELECT id, customer_id FROM users WHERE customer_id IS NOT NULL
                ON CONFLICT DO NOTHING
            """)
            print("Created user_customers table")
        else:
            print("user_customers table already exists")

        # 2. Ensure password_plain column
        col = await conn.fetchval(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'password_plain'"
        )
        if col is None:
            await conn.execute("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)")
            print("Added password_plain column to users table")
        else:
            print("password_plain column already exists")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(ensure())
