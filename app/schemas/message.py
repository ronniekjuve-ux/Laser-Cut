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


class MessageResponse(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    chat_type: str
    chat_id: Optional[int]
    content: str
    reply_to_id: Optional[int]
    created_at: datetime
    mentions: List[int] = []

    class Config:
        from_attributes = True


class ChatUnreadResponse(BaseModel):
    count: int
