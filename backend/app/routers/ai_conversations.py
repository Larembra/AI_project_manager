import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.ai_conversation import AIConversation, AIConversationMessage
from app.config import settings
from app.models.user import User
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/ai/conversations", tags=["ai-conversations"])


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


async def owned_conversation(db: AsyncSession, user: User, conversation_id: uuid.UUID) -> AIConversation:
    result = await db.execute(select(AIConversation).where(AIConversation.id == conversation_id, AIConversation.user_id == user.id))
    conversation = result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(status_code=404, detail="Диалог не найден")
    return conversation


@router.get("", response_model=list[ConversationOut])
async def list_conversations(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIConversation).where(AIConversation.user_id == user.id).order_by(AIConversation.updated_at.desc()))
    return result.scalars().all()


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(data: ConversationCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.title and data.title.strip():
        title = data.title.strip()
    else:
        result = await db.execute(select(func.count()).select_from(AIConversation).where(AIConversation.user_id == user.id))
        title = f"Диалог {result.scalar_one() + 1}"
    conversation = AIConversation(user_id=user.id, title=title)
    db.add(conversation)
    await db.flush()
    await db.refresh(conversation)
    return conversation


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(conversation_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conversation = await owned_conversation(db, user, conversation_id)
    result = await db.execute(select(AIConversationMessage).where(AIConversationMessage.conversation_id == conversation.id).order_by(AIConversationMessage.created_at.desc(), AIConversationMessage.id.desc()).limit(settings.AI_HISTORY_MAX_LIMIT))
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "messages": result.scalars().all()[::-1],
    }


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def rename_conversation(conversation_id: uuid.UUID, data: ConversationRename, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conversation = await owned_conversation(db, user, conversation_id)
    conversation.title = data.title.strip()
    conversation.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(conversation)
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: uuid.UUID, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    conversation = await owned_conversation(db, user, conversation_id)
    await db.delete(conversation)


async def add_message(db: AsyncSession, conversation: AIConversation, role: str, content: str, max_messages: int) -> None:
    db.add(AIConversationMessage(conversation_id=conversation.id, role=role, content=content))
    conversation.updated_at = datetime.now(timezone.utc)
    await db.flush()
    result = await db.execute(select(AIConversationMessage.id).where(AIConversationMessage.conversation_id == conversation.id).order_by(AIConversationMessage.created_at.desc(), AIConversationMessage.id.desc()).offset(max(1, max_messages)))
    old_ids = result.scalars().all()
    if old_ids:
        await db.execute(delete(AIConversationMessage).where(AIConversationMessage.id.in_(old_ids)))
