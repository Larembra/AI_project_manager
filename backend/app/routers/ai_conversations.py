import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.ai_conversation import AIConversation, AIConversationMessage
from app.models.ai_tool_call import AIToolCall
from app.models.ai_agent_step import AIAgentStep
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
    actions: list[dict] = []
    tool_calls: list[dict] = []
    steps: list[dict] = []


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
    action_result = await db.execute(select(AIToolCall).where(AIToolCall.conversation_id == conversation.id, AIToolCall.user_id == user.id, AIToolCall.status == "pending_confirmation").order_by(AIToolCall.created_at))
    tool_result = await db.execute(select(AIToolCall).where(AIToolCall.conversation_id == conversation.id, AIToolCall.user_id == user.id).order_by(AIToolCall.created_at.desc()).limit(40))
    step_result = await db.execute(select(AIAgentStep).where(AIAgentStep.conversation_id == conversation.id).order_by(AIAgentStep.created_at.desc()).limit(20))
    return {
        "id": conversation.id,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "messages": result.scalars().all()[::-1],
        "actions": [{"id": str(action.id), "name": action.name, "summary": action.summary, "status": action.status} for action in action_result.scalars().all()],
        "tool_calls": [{"id": str(call.id), "name": call.name, "summary": call.summary, "status": call.status, "result": call.result} for call in reversed(tool_result.scalars().all())],
        "steps": [{"id": str(step.id), "turn_id": str(step.turn_id), "step_index": step.step_index, "model": step.model, "raw_parts": step.raw_parts} for step in reversed(step_result.scalars().all())],
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


async def add_message(db: AsyncSession, conversation: AIConversation, role: str, content: str, max_messages: int, turn_id: uuid.UUID | None = None, model: str | None = None) -> None:
    db.add(AIConversationMessage(conversation_id=conversation.id, role=role, content=content, turn_id=turn_id, model=model))
    conversation.updated_at = datetime.now(timezone.utc)
    await db.flush()
    result = await db.execute(select(AIConversationMessage).where(AIConversationMessage.conversation_id == conversation.id).order_by(AIConversationMessage.created_at.desc(), AIConversationMessage.id.desc()))
    messages = result.scalars().all()
    kept = 0
    removed_turns = set()
    removed_messages = []
    seen_turns = set()
    for message in messages:
        key = str(message.turn_id) if message.turn_id else f"legacy-{message.id}"
        if key in seen_turns:
            continue
        seen_turns.add(key)
        turn_messages = [candidate for candidate in messages if (str(candidate.turn_id) if candidate.turn_id else f"legacy-{candidate.id}") == key]
        if kept < max(1, max_messages):
            kept += len(turn_messages)
        else:
            removed_messages.extend(candidate.id for candidate in turn_messages)
            if message.turn_id:
                removed_turns.add(message.turn_id)
    if removed_turns:
        await db.execute(delete(AIAgentStep).where(AIAgentStep.conversation_id == conversation.id, AIAgentStep.turn_id.in_(removed_turns)))
    if removed_messages:
        await db.execute(delete(AIConversationMessage).where(AIConversationMessage.id.in_(removed_messages)))
