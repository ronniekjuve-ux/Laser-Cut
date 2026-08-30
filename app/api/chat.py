# -*- coding: utf-8 -*-
from datetime import timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.message import Message, MessageMention, ChatType
from app.schemas.message import MessageCreate, MessageResponse, ChatUnreadResponse, ReplyToMessage, MessageEdit, MentionNotificationResponse
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
    chat_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    before: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages visible to the current user."""
    ct = ChatType(chat_type) if chat_type else None
    messages = await get_visible_messages(db, current_user, ct, limit, offset, before, chat_id)

    result = []
    for msg in messages:
        mentions = [m.mentioned_user_id for m in msg.mentions] if msg.mentions else []
        chat_username = None
        if msg.chat_type == ChatType.PERSONAL and msg.chat_id:
            recipient = await db.get(User, msg.chat_id)
            if recipient:
                chat_username = recipient.username
        reply_to_msg = None
        if msg.reply_to_id:
            reply_msg = await db.get(Message, msg.reply_to_id)
            if reply_msg:
                reply_sender = await db.get(User, reply_msg.sender_id)
                reply_to_msg = ReplyToMessage(
                    id=reply_msg.id,
                    sender_username=reply_sender.username if reply_sender else "?",
                    content=reply_msg.content
                )
        result.append(MessageResponse(
            id=msg.id,
            sender_id=msg.sender_id,
            sender_username=msg.sender.username,
            chat_type=msg.chat_type.value,
            chat_id=msg.chat_id,
            chat_username=chat_username,
            content=msg.content,
            reply_to_id=msg.reply_to_id,
            reply_to_message=reply_to_msg,
            is_edited=msg.is_edited,
            is_deleted=msg.is_deleted,
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

    chat_username = None
    if message.chat_type == ChatType.PERSONAL and message.chat_id:
        recipient = await db.get(User, message.chat_id)
        if recipient:
            chat_username = recipient.username

    reply_to_msg = None
    if message.reply_to_id:
        reply_msg = await db.get(Message, message.reply_to_id)
        if reply_msg:
            reply_sender = await db.get(User, reply_msg.sender_id)
            reply_to_msg = ReplyToMessage(
                id=reply_msg.id,
                sender_username=reply_sender.username if reply_sender else "?",
                content=reply_msg.content
            )

    message_data = {
        "id": message.id,
        "sender_id": message.sender_id,
        "sender_username": current_user.username,
        "chat_type": message.chat_type.value,
        "chat_id": message.chat_id,
        "chat_username": chat_username,
        "content": message.content,
        "reply_to_id": message.reply_to_id,
        "reply_to_message": reply_to_msg.model_dump() if reply_to_msg else None,
        "is_edited": False,
        "is_deleted": False,
        "created_at": message.created_at.isoformat() if message.created_at.tzinfo else message.created_at.replace(tzinfo=timezone.utc).isoformat(),
        "mentions": data.mention_ids or []
    }

    for uid, connections in chat_connections.items():
        if uid == current_user.id:
            continue
        for conn in connections:
            try:
                await conn.send_json({
                    "type": "new_message",
                    "message": message_data
                })
            except Exception:
                pass

    # Send mention notifications to mentioned users
    print(f"MENTION CHECK: mention_ids={data.mention_ids}, connected={list(chat_connections.keys())}", flush=True)
    if data.mention_ids:
        mention_notif = {
            "type": "mention_notification",
            "message_id": message.id,
            "sender_username": current_user.username,
            "content": message.content,
            "chat_type": message.chat_type.value,
            "created_at": message.created_at.isoformat() if message.created_at.tzinfo else message.created_at.replace(tzinfo=timezone.utc).isoformat(),
        }
        for uid in data.mention_ids:
            if uid == current_user.id:
                continue
            conns = chat_connections.get(uid, [])
            print(f"MENTION SEND: user {uid} has {len(conns)} conns", flush=True)
            for conn in conns:
                try:
                    await conn.send_json(mention_notif)
                    print(f"MENTION SENT: to user {uid}", flush=True)
                except Exception as e:
                    print(f"MENTION FAIL: user {uid} err={e}", flush=True)

    return MessageResponse(
        id=message.id,
        sender_id=message.sender_id,
        sender_username=current_user.username,
        chat_type=message.chat_type.value,
        chat_id=message.chat_id,
        chat_username=chat_username,
        content=message.content,
        reply_to_id=message.reply_to_id,
        reply_to_message=reply_to_msg,
        is_edited=False,
        is_deleted=False,
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


@router.get("/mentions", response_model=list[MentionNotificationResponse])
async def get_mentions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages where current user was mentioned."""
    stmt = (
        select(Message, MessageMention.id.label("mention_id"))
        .join(MessageMention, Message.id == MessageMention.message_id)
        .where(MessageMention.mentioned_user_id == current_user.id)
        .where(Message.is_deleted == False)
        .order_by(Message.created_at.desc())
        .limit(50)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        MentionNotificationResponse(
            id=row.mention_id,
            message_id=row.Message.id,
            sender_username=row.Message.sender.username if row.Message.sender else "?",
            content=row.Message.content,
            created_at=row.Message.created_at
        )
        for row in rows
    ]


@router.get("/users")
async def list_chat_users(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List users available for mentions (excludes hidden users)."""
    # Check if show_in_chat column exists
    col_check = await db.execute(text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'users' AND column_name = 'show_in_chat')"
    ))
    has_col = col_check.scalar()

    if has_col:
        result = await db.execute(text(
            "SELECT id, username, role FROM users "
            "WHERE id != :uid AND show_in_chat = TRUE"
        ), {"uid": current_user.id})
    else:
        result = await db.execute(text(
            "SELECT id, username, role FROM users WHERE id != :uid"
        ), {"uid": current_user.id})

    rows = result.fetchall()
    return [{"id": r[0], "username": r[1], "role": r[2]} for r in rows]


@router.put("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: int,
    data: MessageEdit,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(403, "Can only edit own messages")
    if msg.is_deleted:
        raise HTTPException(400, "Cannot edit deleted message")

    msg.content = data.content
    msg.is_edited = True
    msg.updated_at = datetime.now(timezone.utc)
    await db.commit()

    chat_username = None
    if msg.chat_type == ChatType.PERSONAL and msg.chat_id:
        recipient = await db.get(User, msg.chat_id)
        if recipient:
            chat_username = recipient.username

    mentions = [m.mentioned_user_id for m in msg.mentions] if msg.mentions else []

    edit_data = {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "sender_username": current_user.username,
        "chat_type": msg.chat_type.value,
        "chat_id": msg.chat_id,
        "chat_username": chat_username,
        "content": msg.content,
        "reply_to_id": msg.reply_to_id,
        "reply_to_message": None,
        "is_edited": True,
        "is_deleted": False,
        "created_at": msg.created_at.isoformat() if msg.created_at.tzinfo else msg.created_at.replace(tzinfo=timezone.utc).isoformat(),
        "mentions": mentions
    }

    for uid, connections in chat_connections.items():
        for conn in connections:
            try:
                await conn.send_json({"type": "message_edited", "message": edit_data})
            except Exception:
                pass

    return MessageResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        sender_username=current_user.username,
        chat_type=msg.chat_type.value,
        chat_id=msg.chat_id,
        chat_username=chat_username,
        content=msg.content,
        reply_to_id=msg.reply_to_id,
        is_edited=True,
        is_deleted=False,
        created_at=msg.created_at,
        mentions=mentions
    )


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(403, "Can only delete own messages")

    msg.is_deleted = True
    msg.content = ""
    msg.updated_at = datetime.now(timezone.utc)
    await db.commit()

    delete_data = {
        "id": msg.id,
        "is_deleted": True,
    }

    for uid, connections in chat_connections.items():
        for conn in connections:
            try:
                await conn.send_json({"type": "message_deleted", "message": delete_data})
            except Exception:
                pass

    return {"ok": True}
