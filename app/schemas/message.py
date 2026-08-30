# -*- coding: utf-8 -*-
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class MessageCreate(BaseModel):
    chat_type: str  # "general" or "personal"
    content: str
    chat_id: Optional[int] = None  # recipient user ID for personal
    reply_to_id: Optional[int] = None
    mention_ids: Optional[List[int]] = None


class ReplyToMessage(BaseModel):
    id: int
    sender_username: str
    content: str

    class Config:
        from_attributes = True


class MessageEdit(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    chat_type: str
    chat_id: Optional[int]
    chat_username: Optional[str] = None
    content: str
    reply_to_id: Optional[int]
    reply_to_message: Optional[ReplyToMessage] = None
    is_edited: bool = False
    is_deleted: bool = False
    created_at: datetime
    mentions: List[int] = []

    class Config:
        from_attributes = True


class ChatUnreadResponse(BaseModel):
    count: int


class MentionNotificationResponse(BaseModel):
    id: int
    message_id: int
    sender_username: str
    content: str
    created_at: datetime
