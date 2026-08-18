# routers/prism.py
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlmodel import Session, select
from pydantic import BaseModel
import json

from database import get_session
from models import User, Chat, ChatMember, Message, Notification
from dependencies import get_current_user, manager

router = APIRouter(tags=["Prism Chat"])

class CreatePrismChatIn(BaseModel):
    other_user_id: int
    shard1_encrypted: str  
    shard2_genesis: str    

@router.post("/api/chats/prism")
async def create_prism_chat(
    data: CreatePrismChatIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создание чата типа 'Призма'"""
    if data.other_user_id == user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")
    
    other = session.get(User, data.other_user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")

    # 1. Проверяем, нет ли уже активной Призмы с этим юзером
    my_chats = session.exec(select(ChatMember.chat_id).where(ChatMember.user_id == user.id)).all()
    for cid in my_chats:
        chat = session.get(Chat, cid)
        if chat and getattr(chat, 'is_prism', False):
            other_in = session.exec(select(ChatMember).where(
                ChatMember.chat_id == cid, ChatMember.user_id == data.other_user_id
            )).first()
            if other_in:
                return {"chat_id": cid, "already_existed": True}

    # 2. Создаем чат
    chat = Chat(is_prism=True)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="member"))
    session.add(ChatMember(chat_id=chat.id, user_id=data.other_user_id, role="member"))
    
    # 3. Сохраняем "Спектр 1" (Якорь) в профиль текущего пользователя
    user.prism_anchor = data.shard1_encrypted
    session.add(user)
    
    # 4. Создаем ПЕРВОЕ системное сообщение, которое хранит "Спектр 2" (Генезис)
    genesis_msg = Message(
        chat_id=chat.id,
        sender_id=user.id,
        text=f"__PRISM_GENESIS__:{data.shard2_genesis}",
        media_type="system",
    )
    session.add(genesis_msg)
    session.commit()

    # 5. Уведомление
    session.add(Notification(
        user_id=data.other_user_id, 
        actor_id=user.id, 
        type="prism_chat_created",
        details=json.dumps({"chat_id": chat.id}),
    ))
    session.commit()

    await manager.broadcast_to_users([data.other_user_id], "prism_chat_created", {
        "chat_id": chat.id,
        "from_user": user.display_name,
    })

    return {"chat_id": chat.id, "already_existed": False}


@router.patch("/api/users/me/prism-anchor")
async def update_prism_anchor(
    shard1_encrypted: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновление Якоря пользователя (например, при смене PIN-кода)"""
    user.prism_anchor = shard1_encrypted
    session.add(user)
    session.commit()
    return {"ok": True}

router = APIRouter()