# app_split/routers/chats.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from app_split.dependencies import *
from app_split.dependencies import _update_last_seen_sync

router = APIRouter()

@router.get("/api/chats")
def list_chats_v2(
    q: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    memberships = session.exec(
        select(ChatMember.chat_id).where(ChatMember.user_id == user.id)
    ).all()
    if not memberships:
        return []
    chat_ids = list(memberships)


    if not chat_ids:
        return []

    chats = session.exec(select(Chat).where(Chat.id.in_(chat_ids))).all()

    result = []
    for chat in chats:
        data = serialize_chat_for_user(chat, user.id, session)

        # Фильтрация по поиску
        if q.strip():
            q_lower = q.lower()
            if chat.is_group:
                if q_lower not in (chat.name or "").lower():
                    continue
            else:
                other = data.get("other")
                if not other or (q_lower not in other["display_name"].lower()
                                  and q_lower not in other["username"].lower()):
                    continue

        result.append(data)

    # Сортировка:
    # 1. Закреплённые чаты ВСЕГДА сверху
    # 2. Среди закреплённых — по времени закрепления (новые выше)
    # 3. Среди незакреплённых — непрочитанные выше
    # 4. Потом по дате последнего сообщения
    def sort_key(x):
        is_pinned = 0 if x.get("pinned") else 1
        pinned_time = -(datetime.fromisoformat(x["pinned_at"]).timestamp()) if x.get("pinned_at") else 0
        has_unread = 0 if x["unread_count"] > 0 else 1
        last_msg_time = -(datetime.fromisoformat(x["last_message"]["created_at"]).timestamp()) if x.get("last_message") else 0
        return (is_pinned, pinned_time, has_unread, last_msg_time)

    result.sort(key=sort_key)
    return result



class CreateGroupIn(BaseModel):
    name: str
    user_ids: list[int]  # ID пользователей, которых добавляем (кроме себя)


@router.post("/api/chats/group")
@limiter.limit("5/minute")
async def create_group_chat(
    request: Request,
    data: CreateGroupIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not data.name or not data.name.strip():
        raise HTTPException(400, "Название группы обязательно")
    if len(data.name.strip()) > 80:
        raise HTTPException(400, "Название максимум 80 символов")
    if len(data.user_ids) < 1:
        raise HTTPException(400, "Добавьте хотя бы одного участника")
    if len(data.user_ids) > 49:  # 50 всего включая создателя
        raise HTTPException(400, "Максимум 50 участников в группе")
    if user.id in data.user_ids:
        raise HTTPException(400, "Нельзя добавить себя")

    # Проверка, что все пользователи существуют и не забанены
    valid_ids = set()
    for uid in set(data.user_ids):
        target = session.get(User, uid)
        if target and not target.is_banned:
            valid_ids.add(uid)
    if not valid_ids:
        raise HTTPException(400, "Нет валидных пользователей для добавления")

    chat = Chat(is_group=True, name=data.name.strip(), owner_id=user.id)
    session.add(chat)
    session.commit()
    session.refresh(chat)

    # Создатель = owner
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="owner"))
    # Остальные = member
    for uid in valid_ids:
        session.add(ChatMember(chat_id=chat.id, user_id=uid, role="member"))
        # Уведомление о добавлении в группу
        session.add(Notification(
            user_id=uid, actor_id=user.id,
            type="group_invite",
            details=f'{{"chat_id": {chat.id}, "chat_name": "{chat.name}"}}' if False else None,
        ))
    session.commit()

    log_action(session, user.id, "create_group",
               target_type="chat", target_id=chat.id,
               details={"name": chat.name, "members_count": len(valid_ids) + 1},
               ip_address=get_client_ip(request))

    # Уведомляем всех через WebSocket
    asyncio.create_task(manager.broadcast_to_users(
        [user.id] + list(valid_ids),
        "group_created",
        {"chat_id": chat.id, "name": chat.name}
    ))

    return {"chat_id": chat.id}


@router.get("/api/chats/{chat_id}/members")
def get_chat_members(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    members = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id)
    ).all()
    user_ids = [m.user_id for m in members]
    users = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()}
    return [
        {"user": user_out(users[m.user_id], session), "role": m.role,
         "joined_at": m.joined_at.isoformat() if m.joined_at else None}
        for m in members if m.user_id in users
    ]


@router.post("/api/chats/{chat_id}/members")
@limiter.limit("10/minute")
async def add_group_member(
    request: Request,
    chat_id: int,
    user_id: int = Form(...),
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    actor_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    can_manage = has_permission(actor, "manage_groups", session)   # 🆕
    if not actor_member and not can_manage:
        raise HTTPException(403, "Не участник чата")
    if not can_manage and actor_member.role not in ("owner", "admin"):
        raise HTTPException(403, "Только админы группы или право manage_groups")

    existing = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()
    if existing:
        raise HTTPException(400, "Уже в группе")

    target = session.get(User, user_id)
    if not target or target.is_banned:
        raise HTTPException(404, "Пользователь не найден")

    # Лимит участников
    current_count = session.exec(
        select(func.count()).select_from(ChatMember).where(ChatMember.chat_id == chat_id)
    ).one()
    if current_count >= 50:
        raise HTTPException(400, "Достигнут лимит участников (50)")

    session.add(ChatMember(chat_id=chat_id, user_id=user_id, role="member"))
    session.add(Notification(user_id=user_id, actor_id=actor.id, type="group_added"))
    session.commit()

    log_action(session, actor.id, "add_group_member",
               target_type="chat", target_id=chat_id,
               details={"added_user_id": user_id}, ip_address=get_client_ip(request))

    # Все участники узнают о новом
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids,
        "group_member_added",
        {"chat_id": chat_id, "user": user_out(target, session)}
    ))

    return {"ok": True}


@router.delete("/api/chats/{chat_id}/members/{user_id}")
async def remove_group_member(
    chat_id: int,
    user_id: int,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    actor_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    target_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()

    if user_id == actor.id:
        # === ВЫХОД ИЗ ГРУППЫ ===
        if not actor_member:
            raise HTTPException(404, "Не участник")
        
        if actor_member.role == "owner":
            # Передача владения старшему админу или удаление группы
            others = session.exec(
                select(ChatMember).where(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id != actor.id
                )
            ).all()
            if not others:
                cascade_delete_chat(chat_id, session)
                return {"ok": True, "deleted": True}
            new_owner = next((m for m in others if m.role == "admin"), others[0])
            new_owner.role = "owner"
            chat.owner_id = new_owner.user_id
            session.add(chat)
            session.add(new_owner)
        
        # Удаляем membership выходящего участника (и owner после передачи, и обычного)
        session.delete(actor_member)
        session.commit()
        
    else:
        # === КИК ДРУГОГО УЧАСТНИКА ===
        can_manage = has_permission(actor, "manage_groups", session)
        if not can_manage and (not actor_member or actor_member.role not in ("owner", "admin")):
            raise HTTPException(403, "Только админы или право manage_groups могут кикать")
        if not target_member:
            raise HTTPException(404, "Участник не найден")
        if target_member.role == "owner":
            raise HTTPException(403, "Нельзя кикнуть создателя")
        session.delete(target_member)
        session.add(Notification(user_id=user_id, actor_id=actor.id, type="group_kicked"))
        session.commit()

    # Рассылаем оставшимся
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    target_user = session.get(User, user_id)
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids + [user_id],
        "group_member_removed",
        {"chat_id": chat_id, "user_id": user_id,
         "user": user_out(target_user, session) if target_user else None}
    ))

    return {"ok": True}


@router.patch("/api/chats/{chat_id}")
async def update_group_info(
    chat_id: int,
    name: Optional[str] = Form(None),
    avatar_url: Optional[str] = Form(None),
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    can_manage = has_permission(actor, "manage_groups", session)   # 🆕
    if not can_manage and (not member or member.role not in ("owner", "admin")):
        raise HTTPException(403, "Только админы или право manage_groups могут изменять группу")

    if name is not None:
        if not name.strip() or len(name.strip()) > 80:
            raise HTTPException(400, "Название: 1-80 символов")
        chat.name = name.strip()
    if avatar_url is not None:
        chat.avatar_url = avatar_url or None

    session.add(chat)
    session.commit()

    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids,
        "group_info_updated",
        {"chat_id": chat_id, "name": chat.name, "avatar_url": chat.avatar_url}
    ))
    return {"ok": True}


def cascade_delete_chat(chat_id: int, session: Session):
    """Удаляет чат со всеми сообщениями и участниками (массовые DELETE для правильного порядка)"""
    # 0. Получаем ID всех сообщений в чате (для удаления зависимостей)
    message_ids = session.exec(
        select(Message.id).where(Message.chat_id == chat_id)
    ).all()
    
    if message_ids:
        # 1. Удаляем реакции на сообщения
        session.exec(delete(MessageReaction).where(MessageReaction.message_id.in_(message_ids)))
        
        # 2. Обнуляем reply_to_id в ДРУГИХ чатах, если они ссылаются на эти сообщения
        session.exec(
            update(Message)
            .where(Message.reply_to_id.in_(message_ids))
            .values(reply_to_id=None)
        )
        
        # 3. Обнуляем forwarded_from_id в ДРУГИХ чатах
        session.exec(
            update(Message)
            .where(Message.forwarded_from_id.in_(message_ids))
            .values(forwarded_from_id=None)
        )
    
    # 4. Удаляем сообщения
    session.exec(delete(Message).where(Message.chat_id == chat_id))
    
    # 5. Удаляем сессионные ключи
    session.exec(delete(ChatSessionKey).where(ChatSessionKey.chat_id == chat_id))
    
    # 6. Удаляем участников чата
    session.exec(delete(ChatMember).where(ChatMember.chat_id == chat_id))
    
    # 7. Удаляем сам чат
    session.exec(delete(Chat).where(Chat.id == chat_id))
    
    session.commit()


@router.delete("/api/chats/{chat_id}")
async def delete_chat(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить чат (DM или группа). Для DM — удаляет у обоих."""
    try:
        chat = session.get(Chat, chat_id)
        if not chat:
            raise HTTPException(404, "Чат не найден")
        member = session.exec(
            select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
        ).first()
        if not member:
            raise HTTPException(403, "Не участник")
        # Для групп: создатель, админ сайта или право manage_groups
        if chat.is_group and member.role != "owner" and not user.is_admin and not has_permission(user, "manage_groups", session):
            raise HTTPException(403, "Только создатель или право manage_groups может удалить группу")
        # Собираем ID всех участников ДО удаления (для рассылки)
        all_member_ids = session.exec(
            select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
        ).all()
        # Каскадное удаление
        cascade_delete_chat(chat_id, session)
        # 🆕 Рассылаем событие ВСЕМ бывшим участникам
        await manager.broadcast_to_users(
            list(all_member_ids),
            "chat_deleted",
            {"chat_id": chat_id}
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        print(f"❌ Error deleting chat {chat_id}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Ошибка удаления чата: {str(e)}")


@router.post("/api/chats/{chat_id}/messages/{message_id}/reactions")
async def toggle_reaction(
    chat_id: int,
    message_id: int,
    sticker_id: int = Form(None),
    emoji: str = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Участник чата?
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Сообщение существует?
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 3. Проверяем доступ к стикеру/эмодзи
    user_level = get_user_level(user, session)
    sticker_obj = None
    
    if sticker_id:
        sticker_obj = session.get(Sticker, sticker_id)
        if not sticker_obj:
            raise HTTPException(404, "Стикер не найден")
        pack = session.get(StickerPack, sticker_obj.pack_id)
        if not pack.is_active or (user_level < pack.min_level and not user.is_admin):
            raise HTTPException(403, "🔒 Стикер недоступен")
    elif not emoji:
        raise HTTPException(400, "Укажите sticker_id или emoji")
    
    # 4. Toggle: уже стоит — убираем
    if sticker_obj:
        existing = session.exec(select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.sticker_id == sticker_id,
        )).first()
    else:
        existing = session.exec(select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.emoji == emoji,
            MessageReaction.sticker_id == None,
        )).first()
    
    if existing:
        session.delete(existing)
        session.commit()
    else:
        # 5. Лимит реакций на этом сообщении от меня
        my_count = session.exec(select(func.count(MessageReaction.id)).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
        )).one()
        limit = reaction_limit_for(user, session)
        if my_count >= limit:
            raise HTTPException(400, f"Максимум {limit} реакций на вашем уровне")
        
        session.add(MessageReaction(
            message_id=message_id,
            user_id=user.id,
            sticker_id=sticker_id if sticker_obj else None,
            emoji=emoji if not sticker_obj else None,
        ))
        session.commit()
    
    # 6. Собираем актуальные реакции и шлём всем
    reactions = build_reactions_map(session, [message_id], user.id).get(message_id, [])
    all_member_ids = session.exec(select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)).all()
    await manager.broadcast_to_users(list(all_member_ids), "message_reaction", {
        "chat_id": chat_id,
        "message_id": message_id,
        "reactions": reactions,
    })
    return {"ok": True, "reactions": reactions}


@router.post("/api/chats/{chat_id}/messages/sticker")
async def send_sticker_message(
    chat_id: int,
    sticker_id: int = Form(...),
    reply_to_id: int = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отправить стикер как отдельное сообщение в чат"""
    # 1. Участник?
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Стикер существует и доступен?
    sticker = session.get(Sticker, sticker_id)
    if not sticker:
        raise HTTPException(404, "Стикер не найден")
    pack = session.get(StickerPack, sticker.pack_id)
    user_level = get_user_level(user, session)
    if not pack.is_active or (user_level < pack.min_level and not user.is_admin):
        raise HTTPException(403, "🔒 Стикер недоступен")
    
    # 3. Reply
    valid_reply_to = None
    if reply_to_id:
        reply_msg = session.get(Message, reply_to_id)
        if reply_msg and reply_msg.chat_id == chat_id:
            valid_reply_to = reply_to_id
    
    # 4. Создаём сообщение (стикер-картинка или эмодзи как текст)
    if sticker.type == "image":
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            media_url=sticker.content,
            media_type="sticker",
            reply_to_id=valid_reply_to,
        )
    else:
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            text=sticker.content,  # эмодзи как текст
            reply_to_id=valid_reply_to,
        )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    
    # 5. Рассылка
    sender = session.get(User, user.id)
    all_member_ids = session.exec(select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)).all()
    await manager.broadcast_to_users(list(all_member_ids), "new_message", {
        "id": msg.id,
        "chat_id": chat_id,
        "sender_id": user.id,
        "sender_name": sender.display_name if sender else "User",
        "sender_avatar": sender.avatar_url if sender else None,
        "text": msg.text,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "is_encrypted_media": False,
        "reply_to_id": msg.reply_to_id,
        "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
        "reactions": [],
        "pinned": False,
        "created_at": msg.created_at.isoformat(),
    })
    
    return {"ok": True, "message_id": msg.id}


@router.post("/api/chats")
def open_or_create_chat(
    other_user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if other_user_id == user.id:
        raise HTTPException(400, "Cannot chat with yourself")
    other = session.get(User, other_user_id)
    if not other:
        raise HTTPException(404, "User not found")
    
    # 🔥 Ищем существующий DM-чат (ровно 2 участника, не группа, не секретный)
    my_chats = session.exec(
        select(ChatMember.chat_id).where(ChatMember.user_id == user.id)
    ).all()
    
    for chat_id_row in my_chats:
        chat_id = chat_id_row  # это уже число из .all()
        chat = session.get(Chat, chat_id)
        if not chat:
            continue
        # Пропускаем секретные и групповые
        if chat.is_secret or chat.is_group:
            continue
        # ✅ КЛЮЧЕВАЯ ПРОВЕРКА: в чате должно быть РОВНО 2 участника (настоящий DM)
        member_count = session.exec(
            select(func.count()).select_from(ChatMember).where(ChatMember.chat_id == chat_id)
        ).one()
        if member_count != 2:
            continue  # Это не DM — пропускаем
        # Проверяем, что второй участник — именно тот, кого мы ищем
        other_in_chat = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == other_user_id,
            )
        ).first()
        if other_in_chat:
            return {"chat_id": chat_id}
    
    # Не нашли — создаём новый DM
    chat = Chat()
    session.add(chat)
    session.commit()
    session.refresh(chat)
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="member"))
    session.add(ChatMember(chat_id=chat.id, user_id=other_user_id, role="member"))
    session.commit()
    return {"chat_id": chat.id}


@router.post("/api/chats/{chat_id}/session-key")
async def store_session_key(
    chat_id: int,
    recipient_id: int = Form(...),
    encrypted_session_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    my_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    other_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == recipient_id)
    ).first()
    if not my_member or not other_member:
        raise HTTPException(403, "Оба должны быть в чате")

    existing = session.exec(
        select(ChatSessionKey).where(
            ChatSessionKey.chat_id == chat_id,
            ChatSessionKey.user_id == recipient_id,
        )
    ).first()
    if existing:
        existing.encrypted_session_key = encrypted_session_key
        session.add(existing)
    else:
        sk = ChatSessionKey(
            chat_id=chat_id,
            user_id=recipient_id,
            encrypted_session_key=encrypted_session_key,
        )
        session.add(sk)
    session.commit()

    # Уведомляем получателя
    if recipient_id != user.id:
        await manager.broadcast_to_users([recipient_id], "session_key_available", {
            "chat_id": chat_id,
        })

    return {"ok": True}


@router.get("/api/chats/{chat_id}/session-key")
def get_my_session_key(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    sk = session.exec(
        select(ChatSessionKey).where(
            ChatSessionKey.chat_id == chat_id,
            ChatSessionKey.user_id == user.id,
        )
    ).first()
    if not sk:
        raise HTTPException(404, "Session key не найден")
    return {"encrypted_session_key": sk.encrypted_session_key}


@router.post("/api/chats/secret")
async def create_secret_chat(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    other_user_id = request.query_params.get("other_user_id")
    if other_user_id is None:
        try:
            form = await request.form()
            other_user_id = form.get("other_user_id")
        except Exception:
            pass
    if other_user_id is None:
        try:
            data = await request.json()
            other_user_id = data.get("other_user_id")
        except Exception:
            pass
    if other_user_id is None:
        raise HTTPException(400, "other_user_id обязателен")
    other_user_id = int(other_user_id)

    if other_user_id == user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")

    other = session.get(User, other_user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")

    # ✅ Автогенерация ключей для обоих (placeholder если нет)
    ensure_user_has_keys(user.id, session)
    ensure_user_has_keys(other_user_id, session)

    # Уже есть секретный чат?
    my_chats = session.exec(select(ChatMember.chat_id).where(ChatMember.user_id == user.id)).all()
    for cid in my_chats:
        chat = session.get(Chat, cid)
        if chat and chat.is_secret:
            other_in = session.exec(
                select(ChatMember).where(ChatMember.chat_id == cid, ChatMember.user_id == other_user_id)
            ).first()
            if other_in:
                return {"chat_id": cid, "already_existed": True}

    chat = Chat(is_secret=True)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    session.add(ChatMember(chat_id=chat.id, user_id=user.id))
    session.add(ChatMember(chat_id=chat.id, user_id=other_user_id))

    # Уведомление
    session.add(Notification(
        user_id=other_user_id, actor_id=user.id, type="secret_chat_created",
        details=json.dumps({"chat_id": chat.id}),
    ))
    session.commit()

    await manager.broadcast_to_users([other_user_id], "secret_chat_created", {
        "chat_id": chat.id,
        "from_user": user.display_name,
    })

    return {"chat_id": chat.id, "already_existed": False}


@router.post("/api/chats/{chat_id}/messages/encrypted-media")
@limiter.limit("10/minute")
async def upload_encrypted_media(
    request: Request, 
    chat_id: int,
    file: UploadFile = File(...),
    media_type: str = Form(...),
    reply_to_id: int | None = Form(None),  # 🆕
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузка шифрованного медиа для секретных чатов"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    if not chat.is_secret:
        raise HTTPException(400, "Шифрованное медиа только для секретных чатов")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 50 МБ)")

    # Сохраняем шифрованный файл как .enc
    file_id = str(uuid.uuid4())
    ext = {
        "video_note": ".webm.enc",
        "audio": ".webm.enc",
        "image": ".enc",
    }.get(media_type, ".enc")
    
    filename = f"{file_id}{ext}"
    filepath = os.path.join("uploads", filename)
    
    with open(filepath, "wb") as f:
        f.write(content)

    media_url = filename  # Относительный путь

    # 🆕 Проверяем что сообщение для ответа существует и в том же чате
    valid_reply_to = None
    if reply_to_id:
        reply_msg = session.get(Message, reply_to_id)
        if reply_msg and reply_msg.chat_id == chat_id:
            valid_reply_to = reply_to_id

    msg = Message(chat_id=chat_id,
        sender_id=user.id,
        text=None,
        ciphertext="[encrypted_media]",
        media_url=media_url,
        media_type=media_type,
        reply_to_id=valid_reply_to,  # 🆕
    )
    session.add(msg)

    # Уведомление другому участнику
    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
        )
    ).all()
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type="message",
        ))

    session.commit()
    session.refresh(msg)

    # WS рассылка
    await manager.broadcast_to_chat(
        chat_id,
        "new_message",
        {
            "id": msg.id,
            "chat_id": chat_id,
            "sender_id": msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": "[encrypted_media]",
            "ciphertext": "[encrypted_media]",
            "media_url": media_url,
            "media_type": media_type,
            "is_encrypted_media": True,
            "created_at": msg.created_at.isoformat(),
            "reply_to_id": msg.reply_to_id,
            "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
            "reactions": [],
        },
        session,
    )


    from push_service import send_push
    for other in other_members:
        asyncio.create_task(run_in_threadpool(
            send_push, other.user_id,
            "🔒 Секретное сообщение",
            f"{user.display_name}: вложение",
            f"/messages/{chat_id}",
        ))

    return {
        "id": msg.id,
        "media_url": media_url,
        "media_type": media_type,
    }


@router.post("/api/chats/{chat_id}/messages")
@limiter.limit("30/minute")
async def send_message_v2(
    request: Request,
    chat_id: int,
    text: str = Form(""),
    ciphertext: str = Form(""),
    reply_to_id: int | None = Form(None),  
    file: Optional[UploadFile] = File(None),
    media_type: Optional[str] = Form(None),
    is_encrypted_media: Optional[str] = Form(None),  # 🆕
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    valid_reply_to = None  # ← ДОБАВЬ ЭТУ СТРОКУ
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    media_url = None
    media_type_final = None
    
    if file and file.filename:
        ext = os.path.splitext(file.filename or "")[1].lower()
        content = await file.read()
        
        # 🆕 ШИФРОВАННОЕ МЕДИА — сохраняем локально, не на Cloudinary
        if is_encrypted_media == "true" or (chat.is_secret and ciphertext):
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(400, "File too large (max 50MB)")
            
            file_id = str(uuid.uuid4())
            filename = f"{file_id}.enc"
            filepath = os.path.join("uploads", filename)
            with open(filepath, "wb") as f:
                f.write(content)
            media_url = filename
            
            if media_type in ("video_note", "audio", "image", "gif", "video"):
                media_type_final = media_type
            else:
                media_type_final = "image"
        else:
            # Обычное медиа — на Cloudinary
            if len(content) > 20 * 1024 * 1024:
                raise HTTPException(400, "File too large (max 20MB)")
            try:
                result = await run_in_threadpool(
                    lambda: cloudinary.uploader.upload(
                        content, folder=UPLOAD_FOLDER, resource_type="auto",
                    )
                )
                media_url = result.get("secure_url")
                resource_type = result.get("resource_type")
                
                if media_type in ("video_note", "audio", "image", "gif"):
                    media_type_final = media_type
                else:
                    if resource_type == "video":
                        content_type = (file.content_type or "").lower()
                        is_audio = (
                            content_type.startswith("audio/")
                            or ext in {".mp3", ".wav", ".ogg", ".m4a", ".aac"}
                            or (ext == ".webm" and "audio" in content_type)
                        )
                        is_video = (
                            content_type.startswith("video/")
                            or ext in {".mp4", ".mov"}
                            or (ext == ".webm" and "video" in content_type)
                        )
                        if is_audio:
                            media_type_final = "audio"
                        elif ext == ".gif":
                            media_type_final = "gif"
                        elif is_video:
                            media_type_final = "video"
                        else:
                            media_type_final = "image"
                    elif ext == ".gif":
                        media_type_final = "gif"
                    else:
                        media_type_final = "image"
            except Exception as e:
                raise HTTPException(400, f"Upload failed: {str(e)}")

    if chat.is_secret:
        if not ciphertext.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")
        if text.strip():
            raise HTTPException(400, "В секретных чатах нельзя отправлять plain text")
    else:
        if not text.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")

        # 🆕 Проверяем что сообщение для ответа существует и в том же чате
        valid_reply_to = None
        if reply_to_id:
            reply_msg = session.get(Message, reply_to_id)
            if reply_msg and reply_msg.chat_id == chat_id:
                valid_reply_to = reply_to_id

    msg = None
    try:
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            text=text.strip() if text else None,
            ciphertext=ciphertext.strip() if ciphertext else None,
            media_url=media_url,
            media_type=media_type_final,
            reply_to_id=valid_reply_to,
        )
    except Exception as e:
        print(f"❌ Failed to create Message: {e}")
        raise HTTPException(500, f"Ошибка создания сообщения: {str(e)}")
    
    if msg is None:
        raise HTTPException(500, "Не удалось создать сообщение")
    
    session.add(msg)

    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
        )
    ).all()
    notif_type = "group_message" if chat.is_group else "message"
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type=notif_type,
        ))
    session.commit()
    session.refresh(msg)

    # 🆕 === СИСТЕМА УПОМИНАНИЙ В ЧАТАХ ===
    if text.strip():
        mentions = extract_mentions(text)
        if mentions:
            # Находим всех упомянутых пользователей
            mentioned_users = session.exec(
                select(User).where(func.lower(User.username).in_(mentions))
            ).all()
            
            # Получаем ID всех участников чата
            chat_member_ids = set(session.exec(
                select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
            ).all())
            
            for mu in mentioned_users:
                # Уведомляем только если это не сам автор и он есть в чате
                if mu.id != user.id and mu.id in chat_member_ids:
                    session.add(Notification(
                        user_id=mu.id,
                        actor_id=user.id,
                        type="mention",
                        message_id=msg.id
                    ))
                    # 🚀 Пушаем уведомление в реальном времени через WS
                    await manager.broadcast_to_users([mu.id], "new_notification", {
                        "type": "mention",
                        "actor_id": user.id,
                        "actor_name": user.display_name,
                        "message_id": msg.id,
                        "chat_id": chat_id,
                        "text_preview": text[:100]
                    })
            session.commit()




    # 🆕 Добавляем флаг is_encrypted_media в WS рассылку
    is_enc = bool(is_encrypted_media == "true" or (chat.is_secret and media_url and not media_url.startswith("http")))
    
    await manager.broadcast_to_chat(
        chat_id,
        "new_message",
        {
            "id": msg.id,
            "chat_id": chat_id,
            "sender_id": msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "is_encrypted_media": is_enc,  # 🆕
            "created_at": msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
        },
        session,
    )

    # 🆕 PUSH-УВЕДОМЛЕНИЯ получателям
    from push_service import send_push
    for other in other_members:
        if chat.is_secret:
            asyncio.create_task(run_in_threadpool(
                send_push, other.user_id,
                "🔒 Секретное сообщение",
                f"{user.display_name}: новое сообщение",
                f"/messages/{chat_id}",
            ))
        else:
            body = (msg.text or ("📎 Вложение" if media_url else "Сообщение"))[:100]
            asyncio.create_task(run_in_threadpool(
                send_push, other.user_id,
                f"💬 {user.display_name}",
                body,
                f"/messages/{chat_id}",
            ))

    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "text": msg.text,
        "ciphertext": msg.ciphertext,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "is_encrypted_media": is_enc,  # 🆕
        "read": msg.read,
        "created_at": msg.created_at.isoformat(),
    }


@router.post("/api/chats/{chat_id}/typing")
async def send_typing(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),         # ← добавить
):
    
    # Проверяем что юзер участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == current_user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # Собираем всех, КРОМЕ себя
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != current_user.id]
    
    if other_ids:
        await manager.broadcast_to_users(other_ids, "typing", {
            "chat_id": chat_id,
            "user_id": current_user.id,
            "user_name": current_user.display_name,
        })
    
    return {"ok": True}


@router.post("/api/chats/{chat_id}/live-text")
async def send_live_text(
    chat_id: int,
    text: str = Form(""),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 ЖИВЫЕ СООБЩЕНИЯ с учётом приватности"""
    # 🛡️ Пользователь выключил трансляцию своего набора — не шлём
    if not user.live_text_broadcast:
        return {"ok": True}

    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # В секретных чатах не светим plaintext
    chat = session.get(Chat, chat_id)
    if chat and chat.is_secret:
        return {"ok": True}

    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != user.id]
    if not other_ids:
        return {"ok": True}

    # 🛡️ Шлём ТОЛЬКО тем, у кого включён показ живых сообщений
    recipients = session.exec(
        select(User.id).where(
            User.id.in_(other_ids),
            User.live_text_enabled == True,
        )
    ).all()
    if recipients:
        await manager.broadcast_to_users(recipients, "live_text", {
            "chat_id": chat_id,
            "user_id": user.id,
            "user_name": user.display_name,
            "text": text[:2000],
        })
    return {"ok": True}


@router.get("/api/chats/{chat_id}/messages")
def get_messages_v2(
    chat_id: int,
    cursor: Optional[int] = None,  # ← НОВОЕ: ID последнего сообщения
    limit: int = 50,               # ← НОВОЕ: лимит
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 🚀 Курсорная пагинация — загружаем только последние N сообщений
    query = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
    )
    if cursor:
        query = query.where(Message.id < cursor)
    
    messages = session.exec(query.limit(limit)).all()
    messages = list(reversed(messages))  # Хронологический порядок
    
    if not messages:
        return {"messages": [], "has_more": False, "next_cursor": None}
    
    sender_ids = list({msg.sender_id for msg in messages})
    senders = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(sender_ids))
        ).all()
    }
    reactions_map = build_reactions_map(session, [m.id for m in messages], user.id)
    
    result = []
    for msg in messages:
        sender = senders.get(msg.sender_id)
        is_enc = bool(
            msg.media_url and
            not msg.media_url.startswith("http") and
            msg.media_url.endswith(".enc")
        )
        result.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": sender.display_name if sender else "Unknown",
            "sender_avatar": sender.avatar_url if sender else None,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "is_encrypted_media": msg.ciphertext == "[encrypted_media]",
            "read": msg.read,
            "edited": msg.edited,
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "created_at": msg.created_at.isoformat(),
            "pinned": msg.pinned,
            "pinned_by": msg.pinned_by,
            "forwarded_from_id": msg.forwarded_from_id,
            "forwarded_sender_name": msg.forwarded_sender_name,
            "reply_to_id": msg.reply_to_id,
            "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
            "reactions": reactions_map.get(msg.id, []),
        })
    
    has_more = len(messages) == limit
    return {
        "messages": result,
        "has_more": has_more,
        "next_cursor": messages[0].id if messages else None,  # ID самого старого
    }


@router.patch("/api/chats/{chat_id}/messages/{message_id}")
def edit_message(
    chat_id: int,
    message_id: int,
    text: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование своего сообщения"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    msg = session.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.chat_id != chat_id:
        raise HTTPException(403, "Message not in this chat")
    if msg.sender_id != user.id:
        raise HTTPException(403, "You can only edit your own messages")
    
    if not text.strip():
        raise HTTPException(400, "Message cannot be empty")
    
    msg.text = text.strip()
    msg.edited = True  # Добавьте поле edited в модель Message
    session.add(msg)
    session.commit()
    
    return {
        "id": msg.id,
        "text": msg.text,
        "edited": msg.edited,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "pinned": msg.pinned,
    }


@router.delete("/api/chats/{chat_id}/messages/{message_id}")
def delete_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление своего сообщения"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    msg = session.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.chat_id != chat_id:
        raise HTTPException(403, "Message not in this chat")
    can_mod = has_permission(user, "manage_groups", session)
    if msg.sender_id != user.id:
        can_mod = has_permission(user, "manage_groups", session)
        if not user.is_admin and not can_mod:
            raise HTTPException(403, "Можно удалять только свои сообщения")
        sender = session.get(User, msg.sender_id)
        if sender:
            check_sanction_rights(user, sender, session, "удалять сообщения этого пользователя")
    
    session.delete(msg)
    session.commit()
    
    return {"ok": True}


@router.post("/api/chats/{chat_id}/messages/{message_id}/forward")
async def forward_message(
    chat_id: int,
    message_id: int,
    target_chat_id: int = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Находим оригинальное сообщение
    original = session.get(Message, message_id)
    if not original or original.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 2. Проверяем доступ к исходному чату
    orig_member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id
        )
    ).first()
    if not orig_member:
        raise HTTPException(403, "Нет доступа к сообщению")
    
    # 3. Запрет пересылки из секретных чатов
    orig_chat = session.get(Chat, chat_id)
    if orig_chat and orig_chat.is_secret:
        raise HTTPException(403, "Нельзя пересылать из секретных чатов")
    
    # 4. Проверяем доступ к целевому чату
    target_member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == target_chat_id,
            ChatMember.user_id == user.id
        )
    ).first()
    if not target_member:
        raise HTTPException(403, "Нет доступа к целевому чату")
    
    # 5. Получаем имя оригинального отправителя
    orig_sender = session.get(User, original.sender_id)
    
    # 6. Создаём новое сообщение (медиа не копируем — Cloudinary ссылка работает везде)
    new_msg = Message(
        chat_id=target_chat_id,
        sender_id=user.id,
        text=original.text,
        ciphertext=None,  # обычное сообщение, не шифрованное
        media_url=original.media_url,
        media_type=original.media_type,
        forwarded_from_id=original.id,
        forwarded_sender_name=orig_sender.display_name if orig_sender else "Unknown",
    )
    session.add(new_msg)
    
    # 7. Уведомляем участников целевого чата
    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == target_chat_id,
            ChatMember.user_id != user.id
        )
    ).all()
    
    notif_type = "group_message" if session.get(Chat, target_chat_id).is_group else "message"
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type=notif_type,
        ))
    session.commit()
    session.refresh(new_msg)
    
    # 8. WS рассылка
    target_chat = session.get(Chat, target_chat_id)
    await manager.broadcast_to_chat(
        target_chat_id,
        "new_message",
        {
            "id": new_msg.id,
            "chat_id": target_chat_id,
            "sender_id": new_msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": new_msg.text,
            "ciphertext": None,
            "media_url": new_msg.media_url,
            "media_type": new_msg.media_type,
            "is_encrypted_media": False,
            "forwarded_from_id": new_msg.forwarded_from_id,
            "forwarded_sender_name": new_msg.forwarded_sender_name,
            "created_at": new_msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
        },
        session,
    )
    
    # 9. Push-уведомления
    from push_service import send_push
    for other in other_members:
        body = (new_msg.text or "📎 Вложение")[:100]
        asyncio.create_task(run_in_threadpool(
            send_push, other.user_id,
            f"💬 {user.display_name}",
            body,
            f"/messages/{target_chat_id}",
        ))
    
    return {"ok": True, "message_id": new_msg.id}



class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.post("/api/chats/{chat_id}/messages/{message_id}/pin")
async def pin_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    has_pin_right = has_permission(user, "pin_messages", session)
    if (not member or member.role not in ("owner", "admin")) and not has_pin_right:
        raise HTTPException(403, "Только админы группы или владельцы права pin_messages")
    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    

    
    # 4. Получаем сообщение
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 5. Считаем уже закреплённые (макс 5)
    pinned_count = session.exec(
        select(func.count(Message.id)).where(
            Message.chat_id == chat_id,
            Message.pinned == True,
        )
    ).one()
    
    if pinned_count >= 5:
        raise HTTPException(400, "Максимум 5 закреплённых сообщений")
    
    # 6. Закрепляем (ЛЮБОЙ УЧАСТНИК)
    msg.pinned = True
    msg.pinned_at = datetime.now(timezone.utc)
    msg.pinned_by = user.id
    session.add(msg)
    session.commit()
    
    # 7. Уведомляем участников через WS
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    await manager.broadcast_to_users(
        [m for m in all_member_ids],
        "message_pinned",
        {"chat_id": chat_id, "message_id": message_id, "pinned_by": user.id}
    )
    
    return {"ok": True}


@router.post("/api/chats/{chat_id}/pin")
async def pin_chat(chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 3. Уже закреплён?
    if chat.pinned_by == user.id:
        return {"ok": True, "already_pinned": True}

    # 4. Лимит 5 закреплённых чатов
    pinned_count = session.exec(
        select(func.count()).select_from(Chat).where(Chat.pinned_by == user.id)
    ).one()
    if pinned_count >= 5:
        raise HTTPException(400, "Максимум 5 закреплённых чатов. Открепите один из них.")

    # 5. Закрепляем
    chat.pinned_by = user.id
    chat.pinned_at = datetime.now(timezone.utc)
    session.add(chat)
    session.commit()
    return {"ok": True}


@router.delete("/api/chats/{chat_id}/pin")
async def unpin_chat(chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 2. Проверяем, что чат закреплён именно этим пользователем
    if chat.pinned_by != user.id:
        raise HTTPException(400, "Этот чат не закреплён")

    # 3. Открепляем
    chat.pinned_by = None
    chat.pinned_at = None
    session.add(chat)
    session.commit()
    return {"ok": True}


@router.get("/api/chats/{chat_id}/pinned")
def get_pinned_messages(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
        
    pinned_msgs = session.exec(
        select(Message)
        .where(Message.chat_id == chat_id, Message.pinned == True)
        .order_by(Message.pinned_at.desc())
    ).all()
    
    if not pinned_msgs:
        return []
        
    sender_ids = list({m.sender_id for m in pinned_msgs})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}
    
    result = []
    for msg in pinned_msgs:
        sender = senders.get(msg.sender_id)
        result.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": sender.display_name if sender else "Unknown",
            "sender_avatar": sender.avatar_url if sender else None,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "pinned_at": msg.pinned_at.isoformat() if msg.pinned_at else None,
            "pinned_by": msg.pinned_by,
            "created_at": msg.created_at.isoformat(),
        })
    return result


@router.delete("/api/chats/{chat_id}/messages/{message_id}/unpin")
async def unpin_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    has_pin_right = has_permission(user, "pin_messages", session)
    if (not member or member.role not in ("owner", "admin")) and not has_pin_right:
        raise HTTPException(403, "Только админы группы или владельцы права pin_messages")
    
    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    
    
    # 4. Получаем сообщение
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 5. Проверяем права: либо ты закрепил, либо ты админ
    if msg.pinned_by != user.id and member.role not in ("owner", "admin"):
        raise HTTPException(403, "Вы не закрепляли это сообщение и не являетесь админом")
    
    # 6. Открепляем
    msg.pinned = False
    msg.pinned_at = None
    msg.pinned_by = None
    session.add(msg)
    session.commit()
    
    return {"ok": True}


@router.post("/api/chats/{chat_id}/avatar")
@limiter.limit("5/minute")
async def upload_group_avatar(
    request: Request,
    chat_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")
    
    # 3. Проверяем права (админы группы или право manage_groups)
    if member.role not in ("owner", "admin") and not has_permission(user, "manage_groups", session):
        raise HTTPException(403, "Только админы или право manage_groups могут менять аватарку")
    
    # 4. Валидация файла
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}. Поддерживаются: .jpg, .jpeg, .png, .gif, .webp")
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (максимум 5 МБ)")
    
    # 5. Удаляем старую аватарку
    if chat.avatar_url and "cloudinary.com" in chat.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(chat.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    # 6. Загружаем новую
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        chat.avatar_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")
    
    session.add(chat)
    session.commit()
    
    # 7. Уведомляем всех участников
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    await manager.broadcast_to_users(
        [m for m in all_member_ids],
        "group_info_updated",
        {"chat_id": chat_id, "avatar_url": chat.avatar_url}
    )
    
    return {"ok": True, "avatar_url": chat.avatar_url}


@router.get("/api/chats/{chat_id}/media")
def get_chat_media(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Получить все медиа-файлы из чата"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    messages = session.exec(
        select(Message)
        .where(Message.chat_id == chat_id, Message.media_url != None)
        .order_by(Message.created_at.desc())
    ).all()
    
    result = []
    for msg in messages:
        result.append({
            "id": msg.id,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "sender_id": msg.sender_id,
            "created_at": msg.created_at.isoformat(),
        })
    
    return result


@router.post("/api/chats/{chat_id}/read")
async def mark_chat_read(                        # ← def → async def
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    # ОДИН массовый UPDATE
    session.exec(
        update(Message)
        .where(
            Message.chat_id == chat_id,
            Message.sender_id != user.id,
            Message.read == False,
        )
        .values(read=True)
    )
    session.commit()

    # 🆕 Находим ID последнего сообщения в чате (для галочек ✓✓)
    last_msg = session.exec(
        select(Message.id)
        .where(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
        .limit(1)
    ).first()

    # 🆕 Рассылаем событие "прочитано" всем ДРУГИМ участникам
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != user.id]
    
    if other_ids:
        await manager.broadcast_to_users(other_ids, "message_read", {
            "chat_id": chat_id,
            "reader_id": user.id,
            "reader_name": user.display_name,
            "last_read_message_id": last_msg or 0,
        })

    return {"ok": True}


@router.get("/api/chats/unread-count")
def chats_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    total = session.exec(
        select(func.count(Message.id))
        .join(ChatMember, ChatMember.chat_id == Message.chat_id)
        .where(
            ChatMember.user_id == user.id,
            Message.sender_id != user.id,
            Message.read == False,
        )
    ).one()
    return {"count": total}


@router.get("/api/chats/{chat_id}")
def get_chat_info(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    return serialize_chat_for_user(chat, user.id, session)


@router.post("/api/chats/saved")
def get_or_create_saved_chat(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Ищем существующий чат избранного
    chat = session.exec(
        select(Chat).where(Chat.is_saved == True, Chat.owner_id == user.id)
    ).first()
    
    if not chat:
        # Создаем новый
        chat = Chat(is_saved=True, owner_id=user.id)
        session.add(chat)
        session.commit()
        session.refresh(chat)
        
        # Добавляем себя как участника (для авторизации и read-status)
        member = ChatMember(chat_id=chat.id, user_id=user.id, role="owner")
        session.add(member)
        session.commit()
        
    return {
        "id": chat.id,
        "is_saved": True,
        "name": "Избранное"
    }


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Принимаем соединение ПЕРЕД любыми действиями
    await websocket.accept()
    
    # 2. Достаём токен из query-параметров
    token = websocket.query_params.get("token")
    
    # 3. Аутентификация через JWT
    user_id = None
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return
    
    if not user_id:
        await websocket.close(code=4001, reason="Not authenticated")
        return
    
    # 4. Проверяем пользователя в БД
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user or user.is_banned:
            await websocket.close(code=4003, reason="Banned or not found")
            return
    
    # 5. Подключаем к менеджеру
    await manager.connect(websocket, user_id)
    
    # 6. ✅ ОБНОВЛЯЕМ last_seen БЕЗ блокировки event loop
    await run_in_threadpool(_update_last_seen_sync, user_id)
    
    try:
        # 7. Держим соединение открытым
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"❌ WS error for user {user_id}: {e}")
        await manager.disconnect(websocket, user_id)
