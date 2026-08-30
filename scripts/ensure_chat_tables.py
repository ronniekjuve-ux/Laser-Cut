import sys
sys.path.insert(0, '/app')

import asyncio
from app.db.base import engine
from sqlalchemy import text


async def ensure_chat_tables():
    async with engine.connect() as conn:
        # Check if messages table exists
        result = await conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages')"
        ))
        has_messages = result.scalar()

        if not has_messages:
            print("Creating messages table...")
            await conn.execute(text("""
                CREATE TABLE messages (
                    id SERIAL PRIMARY KEY,
                    sender_id INTEGER NOT NULL REFERENCES users(id),
                    chat_type VARCHAR(20) NOT NULL DEFAULT 'general',
                    chat_id INTEGER REFERENCES users(id),
                    content TEXT NOT NULL,
                    reply_to_id INTEGER REFERENCES messages(id),
                    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
                    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ
                )
            """))
            await conn.execute(text("CREATE INDEX ix_messages_sender_id ON messages(sender_id)"))
            await conn.execute(text("CREATE INDEX ix_messages_chat_id ON messages(chat_id)"))
            print("messages table created")
        else:
            # Add missing columns
            cols_result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'"
            ))
            cols = {row[0] for row in cols_result}
            if 'is_edited' not in cols:
                await conn.execute(text("ALTER TABLE messages ADD COLUMN is_edited BOOLEAN NOT NULL DEFAULT FALSE"))
                print("Added is_edited column")
            if 'is_deleted' not in cols:
                await conn.execute(text("ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))
                print("Added is_deleted column")

        # Check if message_mentions table exists
        result = await conn.execute(text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_mentions')"
        ))
        has_mentions = result.scalar()

        if not has_mentions:
            print("Creating message_mentions table...")
            await conn.execute(text("""
                CREATE TABLE message_mentions (
                    id SERIAL PRIMARY KEY,
                    message_id INTEGER NOT NULL REFERENCES messages(id),
                    mentioned_user_id INTEGER NOT NULL REFERENCES users(id),
                    UNIQUE(message_id, mentioned_user_id)
                )
            """))
            await conn.execute(text("CREATE INDEX ix_message_mentions_message_id ON message_mentions(message_id)"))
            await conn.execute(text("CREATE INDEX ix_message_mentions_mentioned_user_id ON message_mentions(mentioned_user_id)"))
            print("message_mentions table created")

        # Add show_in_chat column to users if missing
        users_cols_result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
        ))
        users_cols = {row[0] for row in users_cols_result}
        if 'show_in_chat' not in users_cols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN show_in_chat BOOLEAN NOT NULL DEFAULT TRUE"))
            print("Added show_in_chat column to users")

        await conn.commit()
        print("Chat tables verified OK")


if __name__ == "__main__":
    asyncio.run(ensure_chat_tables())
