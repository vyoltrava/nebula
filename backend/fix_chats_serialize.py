# fix_chats_serialize.py
import os
import re

filepath = "app_split/routers/chats.py"
if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Если функции ещё нет в файле, добавляем её
    if "def serialize_chat_for_user" not in content:
        func_code = """
def serialize_chat_for_user(chat: Chat, user_id: int, session: Session) -> dict:
    \"\"\"Возвращает данные чата, готовые для отправки на фронт\"\"\"
    members = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat.id)
    ).all()
    member_user_ids = [m.user_id for m in members]
    users = session.exec(
        select(User).where(User.id.in_(member_user_ids))
    ).all()
    users_map = {u.id: u for u in users}
    members_map = {m.user_id: m for m in members}
    
    last_msg = session.exec(
        select(Message)
        .where(Message.chat_id == chat.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()
    
    unread = session.exec(
        select(func.count(Message.id)).where(
            Message.chat_id == chat.id,
            Message.sender_id != user_id,
            Message.read == False,
        )
    ).one()
    
    last_message_data = None
    if last_msg:
        sender = users_map.get(last_msg.sender_id)
        if chat.is_secret:
            last_message_data = {"text": "🔒 Секретное сообщение", "is_encrypted": True,
                                 "sender_id": last_msg.sender_id,
                                 "created_at": last_msg.created_at.isoformat()}
        else:
            if last_msg.text:
                preview = last_msg.text[:50]
            elif last_msg.media_type in ("image", "gif"):
                preview = "📷 Фото"
            elif last_msg.media_type == "video":
                preview = "🎬 Видео"
            elif last_msg.media_type == "audio":
                preview = "🎙️ Голосовое"
            else:
                preview = "Сообщение"
            
            if chat.is_group and sender:
                preview = f"{sender.display_name}: {preview}"
                
            last_message_data = {
                "text": preview,
                "is_encrypted": False,
                "sender_id": last_msg.sender_id,
                "created_at": last_msg.created_at.isoformat(),
            }
            
    my_role = members_map.get(user_id).role if user_id in members_map else None
    
    if chat.is_group:
        return {
            "id": chat.id,
            "is_group": True,
            "is_secret": False,
            "name": chat.name or "Без названия",
            "avatar_url": chat.avatar_url,
            "owner_id": chat.owner_id,
            "members_count": len(members),
            "members": [
                {"user": user_out(users_map[m.user_id], session), "role": m.role}
                for m in members if m.user_id in users_map
            ],
            "my_role": my_role,
            "last_message": last_message_data,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
        }
    else:
        other_member = next((m for m in members if m.user_id != user_id), None)
        if not other_member:
            other = users_map.get(user_id)
            return {
                "id": chat.id,
                "is_group": False,
                "is_secret": chat.is_secret,
                "is_saved": True,
                "other": user_out(other, session) if other else None,
                "last_message": last_message_data,
                "unread_count": unread,
                "pinned": chat.pinned_by == user_id,
                "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
            }
        other = users_map.get(other_member.user_id) if other_member else None
        return {
            "id": chat.id,
            "is_group": False,
            "is_secret": chat.is_secret,
            "other": user_out(other, session) if other else None,
            "last_message": last_message_data,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
        }

"""
        # Находим первый @router. и вставляем функцию прямо перед ним
        match = re.search(r'@router\.(get|post|put|delete|patch|websocket)', content)
        if match:
            insert_pos = match.start()
            content = content[:insert_pos] + func_code + "\n" + content[insert_pos:]
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print("✅ Функция serialize_chat_for_user успешно добавлена в chats.py")
        else:
            print("⚠️ Не удалось найти место для вставки функции.")
    else:
        print("✅ Функция уже присутствует в файле.")
else:
    print("⚠️ Файл app_split/routers/chats.py не найден.")