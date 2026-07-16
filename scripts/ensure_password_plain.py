# -*- coding: utf-8 -*-
"""Ensure password_plain column and user_customers table exist.
Uses raw asyncpg — no app imports."""
import asyncio
import os

async def ensure():
    import asyncpg
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        print("DATABASE_URL not set, skipping")
        return

    # asyncpg needs postgresql:// not postgresql+asyncpg://
    dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
    dsn = dsn.replace("postgres://", "postgresql://")

    print(f"Connecting to DB...")
    conn = await asyncpg.connect(dsn)
    try:
        # 1. user_customers table
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
            print("OK: Created user_customers table + migrated data")
        else:
            print("OK: user_customers already exists")

        # 2. password_plain column
        col = await conn.fetchval(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'password_plain'"
        )
        if col is None:
            await conn.execute("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)")
            print("OK: Added password_plain column")
        else:
            print("OK: password_plain already exists")

    finally:
        await conn.close()
        print("Schema ensure complete")

if __name__ == "__main__":
    asyncio.run(ensure())
