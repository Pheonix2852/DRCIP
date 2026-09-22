"""Chat session and message models for RAG history"""
from datetime import datetime
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field

class ChatRole(str, Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    TOOL = "TOOL"

class ChatSession(BaseModel):
    id: str = Field(default_factory=lambda: f"CS-{str(_COUNTER.get_next())[:8].upper()}")
    public_id: str = Field(default_factory=lambda: f"CMD-{str(_COUNTER.get_next())[:8].upper()}")
    user_id: str
    created_at: datetime = datetime.utcnow()
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: f"CHM-{str(_COUNTER.get_next())[:8].upper()}")
    session_id: str
    role: ChatRole
    content: str
    citations: Optional[list[dict]] = None
    tool_calls: Optional[list[dict]] = None
    rag_version: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Simple counter for generating IDs
_Counter = 1

def get_next_id():
    global _Counter
    result = _Counter
    _Counter += 1
    return result

# Session store for this demo
sessions: dict[str, ChatSession] = {}
messages: dict[str, list[ChatMessage]] = {}