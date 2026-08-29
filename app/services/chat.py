# -*- coding: utf-8 -*-
from sqlalchemy import select, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.message import Message, MessageMention, ChatType
from app.models.user import User, UserRole
from typing import Optional, List


async def get_visible_messages(
    db: AsyncSession,
    user: User,
    chat_type: Optional[ChatType] = None,
    limit: int = 50,
    offset: int = 0,
    before: Optional[int] = None
) -> List[Message]:
    """Get messages visible to the user based on their role."""
    stmt = select(Message)

    if chat_type:
        stmt = stmt.where(Message.chat_type == chat_type)

    if before:
        stmt = stmt.where(Message.id < before)

    # Combined visibility filter:
    # - Personal chat: only participants (sender or chat_id)
    # - General chat: all messages for admin/director/operator,
    #   own + mentioned + replies-to-own for customers/accountants
    if user.role in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR):
        # See all messages (general + personal where they participate)
        stmt = stmt.where(
            or_(
                Message.chat_type == ChatType.GENERAL,
                and_(
                    Message.chat_type == ChatType.PERSONAL,
                    or_(
                        Message.sender_id == user.id,
                        Message.chat_id == user.id
                    )
                )
            )
        )
    else:
        # Customers and Accountants:
        # - Personal chat: only where they participate
        # - General chat: only own + mentioned + replies to own
        own_messages = select(Message.id).where(Message.sender_id == user.id)
        mentioned_in = select(MessageMention.message_id).where(
            MessageMention.mentioned_user_id == user.id
        )
        replies_to_own = select(Message.id).where(
            Message.reply_to_id.in_(own_messages)
        )

        stmt = stmt.where(
            or_(
                # Personal chat where user participates
                and_(
                    Message.chat_type == ChatType.PERSONAL,
                    or_(
                        Message.sender_id == user.id,
                        Message.chat_id == user.id
                    )
                ),
                # General chat with restricted visibility
                and_(
                    Message.chat_type == ChatType.GENERAL,
                    or_(
                        Message.sender_id == user.id,
                        Message.id.in_(mentioned_in),
                        Message.id.in_(replies_to_own)
                    )
                )
            )
        )

    stmt = stmt.order_by(Message.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_message(
    db: AsyncSession,
    sender_id: int,
    chat_type: ChatType,
    content: str,
    chat_id: Optional[int] = None,
    reply_to_id: Optional[int] = None,
    mention_ids: Optional[List[int]] = None
) -> Message:
    """Create a new message with optional mentions."""
    message = Message(
        sender_id=sender_id,
        chat_type=chat_type,
        chat_id=chat_id,
        content=content,
        reply_to_id=reply_to_id
    )
    db.add(message)
    await db.flush()

    if mention_ids:
        for uid in mention_ids:
            db.add(MessageMention(message_id=message.id, mentioned_user_id=uid))
        await db.flush()

    return message


async def get_unread_count(db: AsyncSession, user: User) -> int:
    """Get count of unread messages for user."""
    if not user.last_active:
        return 0

    stmt = select(func.count(Message.id)).where(
        Message.created_at > user.last_active,
        Message.sender_id != user.id
    )

    if user.role in (UserRole.ADMIN, UserRole.DIRECTOR, UserRole.OPERATOR):
        # All messages
        pass
    else:
        own_messages = select(Message.id).where(Message.sender_id == user.id)
        mentioned_in = select(MessageMention.message_id).where(
            MessageMention.mentioned_user_id == user.id
        )
        replies_to_own = select(Message.id).where(
            Message.reply_to_id.in_(own_messages)
        )
        stmt = stmt.where(
            or_(
                Message.id.in_(mentioned_in),
                Message.id.in_(replies_to_own)
            )
        )

    result = await db.execute(stmt)
    return result.scalar() or 0
