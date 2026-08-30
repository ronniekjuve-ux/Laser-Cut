# -*- coding: utf-8 -*-
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import auth, users, audit, chat
from app.api.v1.router_orders import router as orders_router
from app.api.v1.router_applications import router as applications_router
from app.api.v1.router_images import router as images_router
from app.api.v1.router_warehouse import router as warehouse_router
from app.api.v1.router_audit import router as audit_data_router
from app.api.v1.router_feedback import router as feedback_router
from jose import JWTError, jwt
from app.core.config import settings

logger = logging.getLogger(__name__)

is_prod = settings.ENVIRONMENT == "prod"


async def ensure_chat_db():
    """Create chat tables if they don't exist. Runs on app startup."""
    try:
        from app.db.base import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            # Create messages table if missing
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'messages')"
            ))
            if not result.scalar():
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
                logger.info("Created messages table")

            # Convert chatttype enum to varchar if needed
            col_result = await conn.execute(text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'messages' AND column_name = 'chat_type'"
            ))
            col_type = col_result.scalar()
            if col_type and 'character' not in col_type:
                # chat_type is not varchar — convert it
                await conn.execute(text(
                    "ALTER TABLE messages ALTER COLUMN chat_type TYPE VARCHAR(20) USING chat_type::text"
                ))
                logger.info("Converted chat_type from enum to varchar")

            # Drop the old chatttype enum if it exists and is unused
            await conn.execute(text("""
                DO $$ BEGIN
                    DROP TYPE IF EXISTS chatttype;
                EXCEPTION WHEN others THEN NULL;
                END $$;
            """))

            # Ensure is_edited, is_deleted columns
            cols_result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'"
            ))
            cols = {row[0] for row in cols_result}
            if 'is_edited' not in cols:
                await conn.execute(text("ALTER TABLE messages ADD COLUMN is_edited BOOLEAN NOT NULL DEFAULT FALSE"))
            if 'is_deleted' not in cols:
                await conn.execute(text("ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE"))

            # Create message_mentions table if missing
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'message_mentions')"
            ))
            if not result.scalar():
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
                logger.info("Created message_mentions table")

            await conn.commit()
            logger.info("Chat DB tables ensured OK")
    except Exception as e:
        logger.error("Failed to ensure chat tables: %s", e)


@asynccontextmanager
async def lifespan(app):
    await ensure_chat_db()
    yield

app = FastAPI(
    title="LaserCut Core",
    version="1.0.0",
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id] = [
                ws for ws in self.active_connections[user_id] if ws != websocket
            ]
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            for ws in self.active_connections[user_id]:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

    async def broadcast(self, message: dict):
        for user_id, connections in self.active_connections.items():
            for ws in connections:
                try:
                    await ws.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        await websocket.close(code=4001)
        return

    # Check if token is revoked
    try:
        from app.db.base import async_session_factory
        from sqlalchemy import text
        async with async_session_factory() as session:
            result = await session.execute(
                text("SELECT is_revoked FROM sessions WHERE token = :token LIMIT 1"),
                {"token": token}
            )
            row = result.fetchone()
            if row and row[0]:
                await websocket.close(code=4001)
                return
    except Exception:
        pass

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)

# Подключаем роутеры
app.include_router(auth.router)
app.include_router(users.router, tags=["Users"])
app.include_router(audit.router, tags=["Audit"])
app.include_router(orders_router)
app.include_router(applications_router, prefix="/api/v1")
app.include_router(images_router, prefix="/api/v1")
app.include_router(warehouse_router, prefix="/api/v1")
app.include_router(feedback_router, prefix="/api/v1")
app.include_router(audit_data_router)
app.include_router(chat.router)

@app.get("/health")
async def health():
    checks = {"backend": "ok"}

    try:
        from app.db.base import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)[:50]}"

    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)[:50]}"

    status_code = 200 if checks.get("database") == "ok" else 503
    return JSONResponse(content=checks, status_code=status_code)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)