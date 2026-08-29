# -*- coding: utf-8 -*-
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.message import Message, MessageMention, ChatType
from app.schemas.message import MessageCreate, MessageResponse, ChatUnreadResponse
from app.core.deps import get_current_user
from app.services.chat import get_visible_messages, create_message, get_unread_count
from typing import Optional, Dict, Set
from jose import JWTError, jwt
from app.core.config import settings

router = APIRouter(prefix="/api/chat", tags=["Chat"])

# WebSocket connection manager for chat
chat_connections: Dict[int, Set[WebSocket]] = {}


@router.websocket("/ws")
async def websocket_chat(websocket: WebSocket):
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

    await websocket.accept()
    if user_id not in chat_connections:
        chat_connections[user_id] = set()
    chat_connections[user_id].add(websocket)

    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "chat_message":
                # Broadcast to all connected users
                message = data.get("message")
                for uid, connections in chat_connections.items():
                    for conn in connections:
                        try:
                            await conn.send_json({
                                "type": "new_message",
                                "message": message
                            })
                        except Exception:
                            pass
    except WebSocketDisconnect:
        chat_connections[user_id].discard(websocket)
        if not chat_connections[user_id]:
            del chat_connections[user_id]


@router.get("/messages", response_model=list[MessageResponse])
async def list_messages(
    chat_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    before: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages visible to the current user."""
    ct = ChatType(chat_type) if chat_type else None
    messages = await get_visible_messages(db, current_user, ct, limit, offset, before)

    result = []
    for msg in messages:
        mentions = [m.mentioned_user_id for m in msg.mentions] if msg.mentions else []
        result.append(MessageResponse(
            id=msg.id,
            sender_id=msg.sender_id,
            sender_username=msg.sender.username,
            chat_type=msg.chat_type.value,
            chat_id=msg.chat_id,
            content=msg.content,
            reply_to_id=msg.reply_to_id,
            created_at=msg.created_at,
            mentions=mentions
        ))
    return result


@router.post("/messages", response_model=MessageResponse)
async def send_message(
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a new message."""
    chat_type = ChatType(data.chat_type)

    if chat_type == ChatType.PERSONAL and not data.chat_id:
        raise HTTPException(400, "chat_id required for personal messages")

    if chat_type == ChatType.PERSONAL and current_user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        raise HTTPException(403, "Only admin/director can send personal messages")

    message = await create_message(
        db, current_user.id, chat_type, data.content,
        data.chat_id, data.reply_to_id, data.mention_ids
    )
    await db.commit()

    # Broadcast to all connected users via WebSocket
    message_data = {
        "id": message.id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "chat_type": message.chat_type.value,
        "chat_id": message.chat_id,
        "content": message.content,
        "reply_to_id": message.reply_to_id,
        "created_at": message.created_at.isoformat(),
        "mentions": data.mention_ids or []
    }

    for uid, connections in chat_connections.items():
        for conn in connections:
            try:
                await conn.send_json({
                    "type": "new_message",
                    "message": message_data
                })
            except Exception:
                pass

    return MessageResponse(
        id=message.id,
        sender_id=message.sender_id,
        sender_username=current_user.username,
        chat_type=message.chat_type.value,
        chat_id=message.chat_id,
        content=message.content,
        reply_to_id=message.reply_to_id,
        created_at=message.created_at,
        mentions=data.mention_ids or []
    )


@router.get("/unread", response_model=ChatUnreadResponse)
async def chat_unread(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get unread message count."""
    count = await get_unread_count(db, current_user)
    return ChatUnreadResponse(count=count)


@router.get("/users")
async def list_chat_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List users available for personal chat."""
    stmt = select(User).where(User.id != current_user.id)
    if current_user.role not in (UserRole.ADMIN, UserRole.DIRECTOR):
        # Regular users can only chat with admin
        stmt = stmt.where(User.role == UserRole.ADMIN)
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [{"id": u.id, "username": u.username, "role": u.role.value} for u in users]
