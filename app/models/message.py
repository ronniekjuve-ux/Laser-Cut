# -*- coding: utf-8 -*-
import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class ChatType(str, enum.Enum):
    GENERAL = "general"
    PERSONAL = "personal"


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    chat_type: Mapped[ChatType] = mapped_column(SAEnum(ChatType), default=ChatType.GENERAL)
    chat_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reply_to_id: Mapped[Optional[int]] = mapped_column(ForeignKey("messages.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    sender = relationship("User", foreign_keys=[sender_id], lazy="selectin")
    reply_to = relationship("Message", remote_side=[id], lazy="selectin")
    mentions = relationship("MessageMention", back_populates="message", lazy="selectin")


class MessageMention(Base):
    __tablename__ = "message_mentions"
    __table_args__ = (UniqueConstraint("message_id", "mentioned_user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id"), index=True)
    mentioned_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    message = relationship("Message", back_populates="mentions")
