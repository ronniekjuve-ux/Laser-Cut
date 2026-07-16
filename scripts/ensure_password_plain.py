# -*- coding: utf-8 -*-
"""Ensure password_plain column and user_customers table exist."""
import asyncio
from sqlalchemy import text
from app.db.base import engine

async def ensure():
    async with engine.connect() as conn:
        # 1. Ensure user_customers table
        result = await conn.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_customers')"
        ))
        if not result.scalar():
            await conn.execute(text(
                "CREATE TABLE user_customers ("
                "user_id INTEGER REFERENCES users(id) PRIMARY KEY,"
                "customer_id INTEGER REFERENCES customers(id) PRIMARY_KEY)"
            ))
            # Migrate existing customer_id data
            await conn.execute(text(
                "INSERT INTO user_customers (user_id, customer_id) "
                "SELECT id, customer_id FROM users WHERE customer_id IS NOT NULL "
                "ON CONFLICT DO NOTHING"
            ))
            await conn.commit()
            print("Created user_customers table")
        else:
            print("user_customers table already exists")

        # 2. Ensure password_plain column
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users' AND column_name = 'password_plain'"
        ))
        if result.fetchone() is None:
            await conn.execute(text("ALTER TABLE users ADD COLUMN password_plain VARCHAR(255)"))
            await conn.commit()
            print("Added password_plain column to users table")
        else:
            print("password_plain column already exists")

if __name__ == "__main__":
    asyncio.run(ensure())
