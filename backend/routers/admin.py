from dependencies import cascade_delete_post, check_hierarchy_or_403, check_sanction_rights, extract_cloudinary_public_id, get_client_ip, get_current_user, has_permission, hash_password, log_action, protect_system_account, require_admin, require_staff, user_out
# app_split/routers/admin.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from dependencies import *

router = APIRouter()

@router.get("/api/admin/permission-tabs")
def get_permission_tabs(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Получить список кастомных вкладок и привязанных к ним прав"""
    setting = session.get(SystemSetting, "permission_tabs_config")
    if not setting:
        return []
    return json.loads(setting.value)


@router.post("/api/admin/permission-tabs")
def save_permission_tabs(
    tabs: str = Form(...), # JSON массив вкладок
    staff: User = Depends(require_staff), 
    session: Session = Depends(get_session)
):
    """Сохранить кастомные вкладки"""
    setting = session.get(SystemSetting, "permission_tabs_config")
    if not setting:
        setting = SystemSetting(key="permission_tabs_config", value=tabs)
    else:
        setting.value = tabs
    session.add(setting)
    session.commit()
    return {"ok": True}


@router.get("/api/admin/users")
def admin_list_users(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_users", session):   # 🆕
        raise HTTPException(403, "Нет права: manage_users")
    users = session.exec(select(User).order_by(User.created_at.desc())).all()

    if not users:
        return []

    user_ids = [u.id for u in users]

    # Массовые запросы вместо N+1
    posts_counts = dict(session.exec(
        select(Post.author_id, func.count()).where(Post.author_id.in_(user_ids)).group_by(Post.author_id)
    ).all())

    followers_counts = dict(session.exec(
        select(Follow.followee_id, func.count()).where(Follow.followee_id.in_(user_ids)).group_by(Follow.followee_id)
    ).all())

    # Последние IP: подзапрос или оконная функция. Проще через group_by с max(id)
    last_ip_map = {}
    last_seen_map = {}
    # Берём последний IPLog для каждого пользователя
    ip_logs = session.exec(
        select(IPLog).where(IPLog.user_id.in_(user_ids)).order_by(IPLog.created_at.desc())
    ).all()
    for log in ip_logs:
        if log.user_id not in last_ip_map:
            last_ip_map[log.user_id] = log.ip_address
            last_seen_map[log.user_id] = log.created_at

    result = []
    for u in users:
        data = user_out(u, session)
        data["last_ip"] = last_ip_map.get(u.id)
        data["last_seen"] = last_seen_map.get(u.id).isoformat() if last_seen_map.get(u.id) else None
        data["posts_count"] = posts_counts.get(u.id, 0)
        data["followers_count"] = followers_counts.get(u.id, 0)
        result.append(data)

    return result


@router.post("/api/admin/users/{user_id}/ban")
def admin_ban_user(
    user_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(admin, "ban_users", session):
        raise HTTPException(403, "No permission: ban_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # Нельзя банить себя
    if target.id == admin.id:
        raise HTTPException(400, "Нельзя забанить самого себя")
    # 🛡️ Единый иммунитет: Founder/Developer/System трогает только Founder
    check_sanction_rights(admin, target, session, "банить этого пользователя")
    
    target.is_banned = not target.is_banned
    session.add(target)
    session.commit()
    log_action(session, admin.id, "ban_user" if target.is_banned else "unban_user",
               target_type="user", target_id=target.id,
               details={"username": target.username})
    session.commit()
    return {"is_banned": target.is_banned}


@router.post("/api/admin/users/{user_id}/warn")
def admin_warn_user(
    user_id: int,
    reason: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "выдавать предупреждения")
    check_hierarchy_or_403(staff, target, session, action="выдать предупреждение этому пользователю")
    if len(reason.strip()) < 3:
        raise HTTPException(400, "Причина слишком короткая")
    w = Warning(user_id=user_id, issuer_id=staff.id, reason=reason.strip())
    session.add(w)
    session.add(Notification(user_id=user_id, actor_id=staff.id, type="warning"))
    log_action(session, staff.id, "warn_user", target_type="user", target_id=user_id,
               details={"reason": reason.strip()})
    session.commit()
    session.refresh(w)
    return {"ok": True, "id": w.id}


@router.get("/api/admin/users/{user_id}/warnings")
def admin_list_warnings(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    warns = session.exec(
        select(Warning).where(Warning.user_id == user_id).order_by(Warning.created_at.desc())
    ).all()
    issuer_ids = list({w.issuer_id for w in warns})
    issuers = {u.id: u for u in session.exec(select(User).where(User.id.in_(issuer_ids or [0]))).all()}
    return [{
        "id": w.id,
        "reason": w.reason,
        "active": w.active,
        "issuer": user_out(issuers.get(w.issuer_id), session) if issuers.get(w.issuer_id) else None,
        "created_at": w.created_at.isoformat(),
        "expires_at": w.expires_at.isoformat() if w.expires_at else None,
    } for w in warns]


@router.delete("/api/admin/warnings/{warning_id}")
def admin_revoke_warning(
    warning_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    w = session.get(Warning, warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    w.active = False
    session.add(w)
    log_action(session, staff.id, "revoke_warning", target_type="warning", target_id=warning_id)
    session.commit()
    return {"ok": True}


@router.delete("/api/admin/users/{user_id}/avatar")
def admin_remove_avatar(
    user_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(admin, "remove_avatars", session):
        raise HTTPException(403, "No permission: remove_avatars")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    check_sanction_rights(admin, target, session, "удалять аватар этого пользователя")
    
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    elif target.avatar_url:
        old_path = os.path.join("uploads", target.avatar_url.split("/")[-1])
        if os.path.exists(old_path):
            os.remove(old_path)
    
    target.avatar_url = None
    session.add(target)
    session.commit()
    return {"ok": True}


@router.post("/api/admin/users/{user_id}/moderator")
def admin_toggle_moderator(
    user_id: int,
    admin: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not (admin.is_admin or has_permission(admin, "assign_moderator", session)):
        raise HTTPException(403, "Нет права: assign_moderator")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == admin.id:
        raise HTTPException(400, "Нельзя менять свой статус")
    check_sanction_rights(admin, target, session, "менять статус этого пользователя")
    target.is_moderator = not target.is_moderator
    session.add(target)
    session.commit()
    log_action(session, admin.id, "toggle_moderator", target_type="user", target_id=target.id,
            details={"is_moderator": target.is_moderator})
    return {"is_moderator": target.is_moderator}


@router.delete("/api/admin/posts/{post_id}")
async def admin_delete_post(
    request: Request,
    post_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    # 🛡️ Иммунитет автора поста
    author = session.get(User, post.author_id)
    if author and author.id != staff.id:
        check_sanction_rights(staff, author, session, "удалять посты этого пользователя")
    await cascade_delete_post(post_id, session)
    log_action(
        session, staff.id, "delete_post",
        target_type="post", target_id=post_id,
        details={"text": post.text[:100] if post.text else None, "by_admin": True},
        ip_address=get_client_ip(request),
    )
    session.commit()
    await manager.broadcast_all("post_deleted", {"post_id": post_id})
    return {"ok": True}


@router.delete("/api/admin/users/{user_id}/posts")
async def admin_delete_all_user_posts(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "delete_posts", session):
        raise HTTPException(403, "No permission: delete_posts")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # 🛡️ Единый иммунитет (Founder/Developer/System + иерархия)
    check_sanction_rights(staff, target, session, "удалять посты этого пользователя")
    
    # Находим все посты пользователя (ТОЛЬКО корни, не ответы)
    user_posts = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id == None)
    ).all()
    
    total_deleted = 0
    for post in user_posts:
        total_deleted += await cascade_delete_post(post.id, session)
    
    # Также удаляем ответы пользователя на чужие посты
    user_replies = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id != None)
    ).all()
    
    reply_ids = [r.id for r in user_replies]
    if reply_ids:
        session.exec(delete(Like).where(Like.post_id.in_(reply_ids)))
        session.exec(delete(PostTag).where(PostTag.post_id.in_(reply_ids)))
        session.exec(delete(Notification).where(Notification.post_id.in_(reply_ids)))
        session.exec(delete(PostView).where(PostView.post_id.in_(reply_ids)))

    for reply in user_replies:
        if reply.media_url and "cloudinary.com" in reply.media_url:
            try:
                public_id = extract_cloudinary_public_id(reply.media_url)
                if public_id:
                    await run_in_threadpool(
                        cloudinary.uploader.destroy,
                        public_id,
                        resource_type="auto"
                    )
            except Exception:
                pass
        elif reply.media_url:
            file_path = os.path.join("uploads", reply.media_url.split("/")[-1])
            if os.path.exists(file_path):
                try:
                    await run_in_threadpool(os.remove, file_path)
                except Exception:
                    pass
        session.delete(reply)
        total_deleted += 1
    
    log_action(
        session, staff.id, "delete_user_posts",
        target_type="user", target_id=user_id,
        details={"deleted_count": total_deleted},
    )
    session.commit()
    return {"ok": True, "deleted_count": total_deleted}


@router.get("/api/admin/sticker-packs")
def admin_list_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    packs = session.exec(select(StickerPack).order_by(StickerPack.id)).all()
    result = []
    for p in packs:
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        result.append({
            "id": p.id,
            "name": p.name,
            "min_level": p.min_level,
            "is_active": p.is_active,
            "is_builtin": p.is_builtin,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
                "order": s.order,
            } for s in stickers],
        })
    return result


@router.post("/api/admin/sticker-packs")
def admin_create_pack(
    name: str = Form(...),
    min_level: int = Form(1),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = StickerPack(name=name.strip(), min_level=min_level)
    session.add(pack)
    session.commit()
    session.refresh(pack)
    return {"ok": True, "id": pack.id}


@router.put("/api/admin/sticker-packs/{pack_id}")
def admin_update_pack(
    pack_id: int,
    name: str = Form(...),
    min_level: int = Form(1),
    is_active: bool = Form(True),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    pack.name = name.strip()
    pack.min_level = min_level
    pack.is_active = is_active
    session.add(pack)
    session.commit()
    return {"ok": True}


@router.delete("/api/admin/sticker-packs/{pack_id}")
def admin_delete_pack(
    pack_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    session.delete(pack)
    session.commit()
    return {"ok": True}


@router.post("/api/admin/sticker-packs/{pack_id}/stickers")
async def admin_add_stickers(
    pack_id: int,
    files: List[UploadFile] = File([]),  # Картинки (PNG/WebP)
    emojis: str = Form("[]"),  # JSON-массив эмодзи
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Массовое добавление стикеров: эмодзи + картинки"""
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    
    # Текущий максимальный order
    max_order = session.exec(
        select(func.max(Sticker.order)).where(Sticker.pack_id == pack_id)
    ).one() or 0
    
    added = []
    
    # 1. Добавляем эмодзи
    try:
        emoji_list = json.loads(emojis)
        if not isinstance(emoji_list, list):
            emoji_list = []
    except:
        emoji_list = []
    
    for e in emoji_list:
        if not e:
            continue
        max_order += 1
        s = Sticker(pack_id=pack_id, type="emoji", content=e, order=max_order)
        session.add(s)
        session.commit()
        session.refresh(s)
        added.append({"id": s.id, "type": "emoji", "content": e, "order": s.order})
    
    # 2. Загружаем картинки в Cloudinary
    import cloudinary.uploader
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        
        contents = await file.read()
        try:
            result = cloudinary.uploader.upload(contents, folder="stickers", resource_type="image")
            url = result["secure_url"]
            
            max_order += 1
            s = Sticker(pack_id=pack_id, type="image", content=url, order=max_order)
            session.add(s)
            session.commit()
            session.refresh(s)
            added.append({"id": s.id, "type": "image", "content": url, "order": s.order})
        except Exception as e:
            print(f"[Stickers] Failed to upload image: {e}")
    
    return {"ok": True, "added": added}


@router.delete("/api/admin/stickers/{sticker_id}")
def admin_delete_sticker(
    sticker_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    sticker = session.get(Sticker, sticker_id)
    if not sticker:
        raise HTTPException(404, "Стикер не найден")
    
    # Удаляем из Cloudinary если это картинка
    if sticker.type == "image" and sticker.content:
        try:
            import cloudinary.uploader
            # Извлекаем public_id из URL
            public_id = sticker.content.split("/")[-1].split(".")[0]
            cloudinary.uploader.destroy(f"stickers/{public_id}")
        except Exception as e:
            print(f"[Stickers] Failed to delete from cloudinary: {e}")
    
    session.delete(sticker)
    session.commit()
    return {"ok": True}


@router.put("/api/admin/stickers/reorder")
def admin_reorder_stickers(
    sticker_ids: str = Form(...),  # JSON массив id в новом порядке
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Изменить порядок стикеров"""
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    try:
        ids = json.loads(sticker_ids)
    except:
        raise HTTPException(400, "Неверный формат")
    
    for i, sid in enumerate(ids):
        sticker = session.get(Sticker, int(sid))
        if sticker:
            sticker.order = i
            session.add(sticker)
    session.commit()
    return {"ok": True}


@router.get("/api/admin/chats")
def admin_list_chats(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Все чаты КРОМЕ секретных. Личные чаты Founder/Developer/System — только для Founder."""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")

    chats = session.exec(
        select(Chat).where(Chat.is_secret == False).order_by(Chat.created_at.desc())
    ).all()
    if not chats:
        return []
    chat_ids = [c.id for c in chats]

    members = session.exec(select(ChatMember).where(ChatMember.chat_id.in_(chat_ids))).all()
    user_ids = list({m.user_id for m in members})
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    members_by_chat = {}
    for m in members:
        members_by_chat.setdefault(m.chat_id, []).append(users.get(m.user_id))

    msgs = session.exec(
        select(Message).where(Message.chat_id.in_(chat_ids)).order_by(Message.created_at.desc())
    ).all()
    last_by_chat = {}
    for m in msgs:
        if m.chat_id not in last_by_chat:
            last_by_chat[m.chat_id] = m

    result = []
    for c in chats:
        chat_users = [u for u in members_by_chat.get(c.id, []) if u]
        # 🛡️ Личные чаты (DM) с иммунитетом скрыты от всех, кроме Founder
        if not c.is_group:
            has_immune = any(u.is_admin or u.is_moderator or u.is_system for u in chat_users)
            if has_immune and not staff.is_admin:
                continue
        last = last_by_chat.get(c.id)
        last_data = None
        if last:
            sender = users.get(last.sender_id)
            last_data = {
                "text": (last.text or "📎 Вложение")[:40],
                "sender_name": sender.display_name if sender else "Unknown",
                "created_at": last.created_at.isoformat(),
            }
        result.append({
            "id": c.id,
            "is_group": c.is_group,
            "name": c.name if c.is_group else (" / ".join([u.display_name for u in chat_users]) or "Диалог"),
            "avatar_url": c.avatar_url,
            "members_count": len(chat_users),
            "last_message": last_data,
            "created_at": c.created_at.isoformat(),
        })
    return result


@router.get("/api/admin/chats/{chat_id}/messages")
def admin_chat_messages(
    chat_id: int,
    limit: int = 200,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Просмотр сообщений чата. Личные чаты Founder/Developer/System — только для Founder."""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    if chat.is_secret:
        raise HTTPException(403, "🔒 Секретные чаты недоступны для модерации")

    # 🛡️ Защита личных чатов с иммунитетом
    if not chat.is_group:
        member_rows = session.exec(select(ChatMember).where(ChatMember.chat_id == chat_id)).all()
        member_users = [session.get(User, m.user_id) for m in member_rows]
        has_immune = any(u and (u.is_admin or u.is_moderator or u.is_system) for u in member_users)
        if has_immune and not staff.is_admin:
            raise HTTPException(403, "🛡️ Личные чаты Founder/Developer недоступны для модерации")

    messages = session.exec(
        select(Message).where(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc()).limit(limit)
    ).all()
    messages.reverse()

    sender_ids = list({m.sender_id for m in messages})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}

    return [{
        "id": m.id,
        "sender_id": m.sender_id,
        "sender_name": senders[m.sender_id].display_name if senders.get(m.sender_id) else "Unknown",
        "sender_avatar": senders[m.sender_id].avatar_url if senders.get(m.sender_id) else None,
        "text": m.text,
        "media_url": m.media_url,
        "media_type": m.media_type,
        "pinned": m.pinned,
        "created_at": m.created_at.isoformat(),
    } for m in messages]


@router.get("/api/admin/stats")
def admin_get_stats(
    request: Request,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    ip = get_client_ip(request)
    session.add(IPLog(
        user_id=staff.id,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
        action="tech_access"
    ))
    log_action(session, staff.id, "tech_panel_access", ip_address=ip)
    session.commit()
    
    # Общие счётчики
    total_users = session.exec(select(func.count()).select_from(User)).one()
    total_posts = session.exec(select(func.count()).select_from(Post)).one()
    total_likes = session.exec(select(func.count()).select_from(Like)).one()
    total_chats = session.exec(select(func.count()).select_from(Chat)).one()
    
    # Топ по подписчикам — ОДИН запрос с JOIN
    top_followers_query = (
        select(User, func.count(Follow.follower_id).label("followers_count"))
        .outerjoin(Follow, Follow.followee_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Follow.follower_id).desc())
        .limit(5)
    )
    top_followers = [
        {**user_out(u, session), "followers_count": count}
        for u, count in session.exec(top_followers_query).all()
    ]
    
    # Топ по постам — ОДИН запрос с JOIN
    top_posts_query = (
        select(User, func.count(Post.id).label("posts_count"))
        .outerjoin(Post, Post.author_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Post.id).desc())
        .limit(5)
    )
    top_posts = [
        {**user_out(u, session), "posts_count": count}
        for u, count in session.exec(top_posts_query).all()
    ]
    
    # Последние регистрации
    recent_users = session.exec(
        select(User).order_by(User.created_at.desc()).limit(10)
    ).all()
    
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_likes": total_likes,
        "total_chats": total_chats,
        "top_followers": top_followers,
        "top_posts": top_posts,
        "recent_registrations": [
            {**user_out(u, session), "created_at": u.created_at.isoformat()}
            for u in recent_users
        ],
    }


@router.get("/api/admin/users/{user_id}/full")
def admin_get_user_full(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    
    posts_count = session.exec(
        select(func.count()).select_from(Post).where(Post.author_id == user_id)
    ).one()
    followers_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
    ).one()
    likes_given = session.exec(
        select(func.count()).select_from(Like).where(Like.user_id == user_id)
    ).one()
    
    return {
        **user_out(user, session),
        "created_at": user.created_at.isoformat(),
        "posts_count": posts_count,
        "followers_count": followers_count,
        "likes_given": likes_given,
    }


@router.patch("/api/admin/users/{user_id}/technical")
def admin_edit_user_technical(
    user_id: int,
    username: Optional[str] = Form(None),
    display_name: Optional[str] = Form(None),
    new_password: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "редактировать")
    
    # 🛡️ НОВАЯ ЛОГИКА:
    # - Founder может редактировать ВСЕХ (включая других Founder и себя)
    # - Tech Admin и ниже НЕ могут редактировать Founder
    if target.is_admin and not staff.is_admin:
        raise HTTPException(403, "Только Founder может редактировать аккаунт Founder")
    
    # 🛡️ Developer не может редактировать Founder (двойная защита)
    if target.is_admin and staff.is_moderator and not staff.is_admin:
        raise HTTPException(403, "Только Founder может редактировать аккаунт Founder")
    
    # Смена username с проверкой уникальности
    if username:
        username = username.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,30}$", username):
            raise HTTPException(400, "Username: 3-30 символов, латиница/цифры/_")
        existing = session.exec(
            select(User).where(User.username == username, User.id != user_id)
        ).first()
        if existing:
            raise HTTPException(400, "Username уже занят")
        target.username = username
    
    # Смена display_name
    if display_name:
        if len(display_name.strip()) < 1 or len(display_name.strip()) > 50:
            raise HTTPException(400, "Display name: 1-50 символов")
        target.display_name = display_name.strip()
    
    # Смена пароля (без проверки старого — это техпанель)
    if new_password:
        if len(new_password) < 6:
            raise HTTPException(400, "Пароль минимум 6 символов")
        target.password_hash = hash_password(new_password)
    
    session.add(target)
    session.commit()
    session.refresh(target)
    
    return {
        "ok": True,
        "user": user_out(target, session),
    }


@router.post("/api/admin/users/{user_id}/reset-2fa")
def admin_reset_2fa(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Сброс 2FA пользователю. Founder может сбросить себе."""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    # 🆕 Сброс СЕБЕ — всегда разрешаем
    is_self = target.id == staff.id
    
    if not is_self:
        # 🛡️ Единый иммунитет для чужих аккаунтов
        check_sanction_rights(staff, target, session, "сбрасывать 2FA этому пользователю")
    
    # Проверяем что 2FA вообще включена
    if not target.totp_enabled:
        raise HTTPException(400, "У пользователя 2FA не включена")
    
    # Очищаем все данные 2FA
    target.totp_enabled = False
    target.totp_secret = None
    target.totp_backup_codes = None
    session.add(target)
    
    log_action(
        session, staff.id, "reset_2fa",
        target_type="user", target_id=target.id,
        details={"username": target.username, "self_reset": is_self},
    )
    session.commit()
    
    return {"ok": True, "username": target.username}


@router.post("/api/admin/users/{user_id}/avatar/set")
async def admin_set_user_avatar(
    user_id: int,
    file: UploadFile = File(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "менять аватар") 
    if target.is_admin:
        raise HTTPException(403, "Cannot edit admin account")
    
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, "Invalid image type")
    
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5MB)")
    
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                await run_in_threadpool(
                    lambda: cloudinary.uploader.destroy(public_id)
                )
        except Exception:
            pass
    
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        target.avatar_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Upload failed: {str(e)}")
    
    session.add(target)
    session.commit()
    
    return {"ok": True, "avatar_url": target.avatar_url}


def serialize_chat_for_user(chat: Chat, user_id: int, session: Session) -> dict:
    """Возвращает данные чата, готовые для отправки на фронт"""
    members = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat.id)
    ).all()
    member_user_ids = [m.user_id for m in members]
    users = session.exec(
        select(User).where(User.id.in_(member_user_ids))
    ).all()
    users_map = {u.id: u for u in users}
    members_map = {m.user_id: m for m in members}

    # Последнее сообщение
    last_msg = session.exec(
        select(Message)
        .where(Message.chat_id == chat.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()

    # Непрочитанные
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
            # В группах добавляем имя отправителя в превью
            if chat.is_group and sender:
                preview = f"{sender.display_name}: {preview}"
            last_message_data = {
                "text": preview,
                "is_encrypted": False,
                "sender_id": last_msg.sender_id,
                "created_at": last_msg.created_at.isoformat(),
            }

    # Мой статус в группе
    my_role = members_map.get(user_id).role if user_id in members_map else None

    if chat.is_group:
        return {
            "id": chat.id,
            "is_group": True,
            "is_secret": False,  # группы без E2EE
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
            "pinned": chat.pinned_by == user_id,  # 🆕
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
        }
    else:
        # DM — как раньше
        other_member = next((m for m in members if m.user_id != user_id), None)
        
        # 🆕 ЧАТ С САМИМ СОБОЙ (избранное)
        if not other_member:
            other = users_map.get(user_id)  # Берём самого себя
            return {
                "id": chat.id,
                "is_group": False,
                "is_secret": chat.is_secret,
                "is_saved": True,  # 🆕 Флаг для фронта
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


@router.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Мягкое удаление — анонимизация в стиле Telegram/VK"""
    if not staff.is_admin:
        if not has_permission(staff, "tech_access", session) or not has_permission(staff, "delete_users", session):
            raise HTTPException(403, "No permission: delete_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    if target.id == staff.id:
        raise HTTPException(400, "Cannot delete your own account via admin panel")
    
    # 🛡️ Иммунитет системных аккаунтов
    check_sanction_rights(staff, target, session, "удалять этот аккаунт")

    # === МЯГКОЕ УДАЛЕНИЕ: анонимизируем вместо физического ===
    target.username = f"deleted_{target.id}"
    target.display_name = "Удаленный аккаунт"
    target.avatar_url = None
    target.cover_url = None
    target.bio = ""
    target.is_banned = True
    target.token_version = (target.token_version or 0) + 1  # выкидываем из всех сессий
    
    # Очищаем 2FA чтобы не висела
    target.totp_enabled = False
    target.totp_secret = None
    target.totp_backup_codes = None
    
    session.add(target)
    
    log_action(
        session, staff.id, "user_soft_deleted",
        target_type="user", target_id=target.id,
        details={"username": target.username},
    )
    session.commit()
    
    return {
        "ok": True,
        "message": "Аккаунт анонимизирован и заблокирован",
    }
    


@router.get("/api/admin/users/{user_id}/ip-history")
def get_user_ip_history(
    user_id: int,
    limit: int = 20,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """История IP-адресов пользователя"""
    logs = session.exec(
        select(IPLog)
        .where(IPLog.user_id == user_id)
        .order_by(IPLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": log.id,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "action": log.action,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/api/admin/ip-blocks")
def list_ip_blocks(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Список заблокированных IP"""
    blocks = session.exec(select(IPBlock).order_by(IPBlock.created_at.desc())).all()
    result = []
    for b in blocks:
        blocker = session.get(User, b.blocked_by) if b.blocked_by else None
        result.append({
            "id": b.id,
            "ip_address": b.ip_address,
            "reason": b.reason,
            "created_at": b.created_at.isoformat(),
            "expires_at": b.expires_at.isoformat() if b.expires_at else None,
            "blocked_by": user_out(blocker, session) if blocker else None,
        })
    return result


@router.post("/api/admin/ip-blocks")
def create_ip_block(
    request: Request,
    ip_address: str = Form(...),
    reason: str = Form(""),
    hours: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "ban_users", session):
        raise HTTPException(403, "Нет прав: ban_users")
    
    existing = session.exec(select(IPBlock).where(IPBlock.ip_address == ip_address)).first()
    if existing:
        raise HTTPException(400, "Этот IP уже заблокирован")
    
    expires_at = None
    if hours and hours > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
    
    block = IPBlock(
        ip_address=ip_address.strip(),
        reason=reason.strip() if reason else None,
        blocked_by=staff.id,
        expires_at=expires_at,
    )
    session.add(block)
    
    log_action(
        session, staff.id, "block_ip",
        target_type="ip", details={"ip": ip_address, "reason": reason},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return {"ok": True, "id": block.id}


@router.delete("/api/admin/ip-blocks/{block_id}")
def delete_ip_block(
    request: Request,
    block_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "ban_users", session):
        raise HTTPException(403, "Нет прав: ban_users")
    
    block = session.get(IPBlock, block_id)
    if not block:
        raise HTTPException(404, "Блок не найден")
    
    ip = block.ip_address
    session.delete(block)
    log_action(
        session, staff.id, "unblock_ip",
        target_type="ip", details={"ip": ip},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return {"ok": True}


@router.get("/api/admin/logs")
def list_action_logs(
    request: Request,
    limit: int = 100,
    action: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет прав")
    
    print(f"📋 Loading logs: limit={limit}, action={action}")
    
    query = select(ActionLog).order_by(ActionLog.created_at.desc()).limit(limit)
    if action:
        query = query.where(ActionLog.action == action)
    
    logs = session.exec(query).all()
    print(f"📋 Found {len(logs)} logs in DB")
    
    result = []
    for log in logs:
        try:
            actor = session.get(User, log.actor_id) if log.actor_id else None
            
            # Безопасный парсинг JSON
            details_parsed = None
            if log.details:
                try:
                    details_parsed = json.loads(log.details)
                except Exception:
                    details_parsed = {"raw": str(log.details)}
            
            result.append({
                "id": log.id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "details": details_parsed,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
                "actor": user_out(actor, session) if actor else None,
            })
        except Exception as e:
            print(f"❌ Error parsing log {log.id}: {e}")
            continue
    
    print(f"📋 Returning {len(result)} logs")
    return result


@router.get("/api/admin/logs/debug")
def debug_logs(
    request: Request,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Диагностика: сколько логов в БД и их структура"""
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет прав")
    
    total = session.exec(select(func.count()).select_from(ActionLog)).one()
    sample = session.exec(select(ActionLog).order_by(ActionLog.created_at.desc()).limit(3)).all()
    
    sample_data = []
    for log in sample:
        sample_data.append({
            "id": log.id,
            "action": log.action,
            "actor_id": log.actor_id,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "details_type": type(log.details).__name__,
            "details_value": str(log.details)[:200] if log.details else None,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    
    return {
        "total_in_db": total,
        "sample": sample_data,
    }


@router.delete("/api/admin/logs")
def clear_action_logs(
    staff: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Очистить логи (только для Founder)"""
    logs = session.exec(select(ActionLog)).all()
    count = len(logs)
    for log in logs:
        session.delete(log)
    session.commit()
    return {"ok": True, "deleted": count}

# ---------- БАГ-ТРЕКЕР ----------

from models import BugReport



# ==== (миграция из main.py) ====
@router.post("/api/admin/users/{user_id}/ban-admin")
def admin_ban_admin(
    user_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """☢️ ЯДЕРНАЯ КНОПКА: банит админа и мгновенно откатывает ВСЕ его действия из резерва
    (восстанавливаются все удалённые им посты, снимаются его баны пользователей)."""
    _require_backup_manager(admin, session)
    if user_id == admin.id:
        raise HTTPException(400, "Нельзя применить к самому себе")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if not (target.is_admin or target.is_moderator):
        raise HTTPException(400, "Это не админ/модератор — используйте обычный бан")

    # 1. Бан + сброс всех сессий
    target.is_banned = True
    target.token_version = (target.token_version or 0) + 1
    session.add(target)

    # 2. Мгновенный откат всех его действий из резервной БД
    backups = session.exec(
        select(AdminBackup)
        .where(AdminBackup.actor_id == user_id, AdminBackup.restored == False)
        .order_by(AdminBackup.created_at.asc())
    ).all()
    restored = {"delete_post": 0, "ban_user": 0}
    for b in backups:
        r = restore_backup(b, session, admin.id)
        if r.get("status") == "ok":
            key = "delete_post" if b.action == "delete_post" else "ban_user"
            restored[key] = restored.get(key, 0) + 1

    log_action(session, admin.id, "ban_admin_rollback",
               target_type="user", target_id=user_id,
               details={"restored": restored, "username": target.username})
    session.commit()
    return {"ok": True, "banned": target.username, "restored": restored}


@router.get("/api/admin/post-reaction-packs")
def admin_get_post_reaction_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    cfg = get_post_reaction_config(session)
    packs = session.exec(select(StickerPack).order_by(StickerPack.id)).all()
    result = []
    for p in packs:
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        allowed = cfg.get(str(p.id))
        result.append({
            "id": p.id,
            "name": p.name,
            "is_active": p.is_active,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
            } for s in stickers],
            # какие реакции пака разрешены на постах (None = пак не включён)
            "selected": allowed if isinstance(allowed, list) else None,
        })
    return result


@router.put("/api/admin/post-reaction-packs")
def admin_set_post_reaction_packs(
    config: str = Form(...),  # JSON: {pack_id: [sticker_id, ...]}
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    try:
        cfg = json.loads(config)
        if not isinstance(cfg, dict):
            raise ValueError
        clean = {}
        for pid, ids in cfg.items():
            if isinstance(ids, list) and ids:
                clean[str(int(pid))] = [int(i) for i in ids]
    except Exception:
        raise HTTPException(400, "config должен быть JSON объектом {pack_id: [sticker_id, ...]}")
    set_post_reaction_config(session, clean)
    return {"ok": True, "config": get_post_reaction_config(session)}


@router.get("/api/admin/chats/{chat_id}/members")
def admin_chat_members(
    chat_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Участники чата для панели модерации"""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    if chat.is_secret:
        raise HTTPException(403, "Секретные чаты недоступны")

    # 🔒 ПРИВАТНОСТЬ: участники видны только при активной жалобе на этот чат
    report = _active_chat_report_for_chat(session, chat_id)
    if not report:
        raise HTTPException(403, "🔒 Приватность: доступ открывается только при активной жалобе")

    members = session.exec(select(ChatMember).where(ChatMember.chat_id == chat_id)).all()
    users = {u.id: u for u in session.exec(
        select(User).where(User.id.in_([m.user_id for m in members] or [0]))
    ).all()}

    now = datetime.now(timezone.utc)  # noqa: F841 (для будущего сравнения muted_until)
    return [{
        "user_id": m.user_id,
        "role": m.role,
        "joined_at": m.joined_at.isoformat(),
        "username": users[m.user_id].username if m.user_id in users else None,
        "display_name": users[m.user_id].display_name if m.user_id in users else "Unknown",
        "avatar_url": users[m.user_id].avatar_url if m.user_id in users else None,
        "is_banned": users[m.user_id].is_banned if m.user_id in users else False,
        "is_staff": bool(users[m.user_id] and (users[m.user_id].is_admin or users[m.user_id].is_moderator or users[m.user_id].is_trelod)) if m.user_id in users else False,
        "muted_until": (
            session.get(SystemSetting, f"chat_mute_{chat_id}_{m.user_id}").value
            if session.get(SystemSetting, f"chat_mute_{chat_id}_{m.user_id}") else None
        ),
    } for m in members]


@router.post("/api/admin/chats/{chat_id}/block")
def admin_block_chat(
    chat_id: int,
    reason: str = Form(""),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Блокировка всего чата (группы/канала): отправка сообщений запрещена"""
    chat = _chat_moderation_guard(staff, chat_id, session)
    if not chat.is_group:
        raise HTTPException(400, "Блокировка доступна только для групповых чатов")
    setting = session.get(SystemSetting, f"chat_blocked_{chat_id}")
    if setting:
        setting.value = "1"
    else:
        session.add(SystemSetting(key=f"chat_blocked_{chat_id}", value="1"))
    log_action(session, staff.id, "block_chat", target_type="chat", target_id=chat_id,
               details={"reason": reason})
    session.commit()
    return {"ok": True, "blocked": True}


@router.post("/api/admin/chats/{chat_id}/unblock")
def admin_unblock_chat(
    chat_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Разблокировка чата (доступна и после закрытия жалобы)"""
    _chat_moderation_guard(staff, chat_id, session, require_report=False)
    setting = session.get(SystemSetting, f"chat_blocked_{chat_id}")
    if setting:
        session.delete(setting)
    log_action(session, staff.id, "unblock_chat", target_type="chat", target_id=chat_id)
    session.commit()
    return {"ok": True, "blocked": False}


@router.post("/api/admin/chats/{chat_id}/members/{user_id}/kick")
def admin_kick_member(
    chat_id: int,
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Исключить участника из чата"""
    _chat_moderation_guard(staff, chat_id, session)
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()
    if not member:
        raise HTTPException(404, "Участник не найден")
    if member.role == "owner":
        raise HTTPException(400, "Нельзя исключить владельца чата")
    target = session.get(User, user_id)
    if target:
        # 🛡️ Иммунитет по уровню (как warn/ban в секции юзеров)
        protect_system_account(target, staff, "модерировать этого участника")
        check_hierarchy_or_403(staff, target, session, action="модерировать этого участника в чате")
    session.delete(member)
    log_action(session, staff.id, "kick_chat_member", target_type="user", target_id=user_id,
               details={"chat_id": chat_id})
    session.commit()
    return {"ok": True}


@router.post("/api/admin/chats/{chat_id}/members/{user_id}/mute")
def admin_mute_member(
    chat_id: int,
    user_id: int,
    minutes: int = Form(60),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Мут участника в чате на N минут"""
    _chat_moderation_guard(staff, chat_id, session)
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()
    if not member:
        raise HTTPException(404, "Участник не найден")
    if member.role == "owner":
        raise HTTPException(400, "Нельзя замутить владельца чата")
    target = session.get(User, user_id)
    if target:
        # 🛡️ Иммунитет по уровню (как warn/ban в секции юзеров)
        protect_system_account(target, staff, "модерировать этого участника")
        check_hierarchy_or_403(staff, target, session, action="выдать мут этому участнику в чате")
    until = datetime.now(timezone.utc) + timedelta(minutes=max(1, minutes))
    key = f"chat_mute_{chat_id}_{user_id}"
    setting = session.get(SystemSetting, key)
    if setting:
        setting.value = until.isoformat()
    else:
        session.add(SystemSetting(key=key, value=until.isoformat()))
    log_action(session, staff.id, "mute_chat_member", target_type="user", target_id=user_id,
               details={"chat_id": chat_id, "minutes": minutes})
    session.commit()
    return {"ok": True, "muted_until": until.isoformat()}


@router.post("/api/admin/chats/{chat_id}/members/{user_id}/unmute")
def admin_unmute_member(
    chat_id: int,
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    key = f"chat_mute_{chat_id}_{user_id}"
    setting = session.get(SystemSetting, key)
    if setting:
        session.delete(setting)
    log_action(session, staff.id, "unmute_chat_member", target_type="user", target_id=user_id,
               details={"chat_id": chat_id})
    session.commit()
    return {"ok": True}


@router.patch("/api/admin/teams/{cat_id}/panel-tabs")
def set_category_panel_tabs(
    cat_id: int,
    data: PanelTabsIn,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """🎨 Разделы админки, за которые отвечает группа/отдел (вкладки красятся
    цветом категории, заявки этих разделов летят в отдел)."""
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    cat = session.get(RoleCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    cat.panel_tabs = json.dumps([str(t) for t in data.tabs][:32])
    session.add(cat)
    session.commit()
    return {"ok": True, "category_id": cat.id, "panel_tabs": json.loads(cat.panel_tabs)}


@router.get("/api/admin/mod-unread-count")
def get_mod_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Сколько активных/открытых заявок в каждой вкладке модерации."""
    counts: dict[str, int] = {"reports": 0, "support": 0, "bugs": 0}
    if user.is_admin or has_permission(user, "manage_reports", session):
        counts["reports"] = session.exec(
            select(func.count(Report.id)).where(Report.status == "pending")
        ).one() or 0
    if user.is_admin or has_permission(user, "manage_support", session):
        counts["support"] = session.exec(
            select(func.count(SupportTicket.id)).where(SupportTicket.status == "open")
        ).one() or 0
    if user.is_admin or has_permission(user, "tech_access", session):
        counts["bugs"] = session.exec(
            select(func.count(BugReport.id)).where(BugReport.status.in_(["new", "in_progress"]))
        ).one() or 0
    return {"counts": counts}


@router.get("/api/admin/statistics/overview")
def get_statistics_overview(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Общая статистика платформы"""
    now = datetime.now(timezone.utc)
    
    return {
        "registrations": {
            "24h": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(hours=24))).one(),
            "7d": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(days=7))).one(),
            "30d": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(days=30))).one(),
        },
        "activity": {
            "posts_24h": session.exec(select(func.count(Post.id)).where(Post.created_at >= now - timedelta(hours=24))).one(),
            "mod_actions_24h": session.exec(select(func.count(ActionLog.id)).where(ActionLog.created_at >= now - timedelta(hours=24))).one(),
        },
        "online": {"count": manager.total_connections},
        "totals": {
            "users": session.exec(select(func.count(User.id))).one(),
            "posts": session.exec(select(func.count(Post.id))).one(),
            "chats": session.exec(select(func.count(Chat.id))).one(),
        },
    }


@router.get("/api/admin/stats/overview")
def stats_overview(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Карточки обзора: totals, MAU/DAU, регистрации, серии за 14 дней"""
    _require_stats_access(staff, session)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    since = today_start - timedelta(days=13)

    def day_series(col, since_dt):
        rows = session.exec(
            select(func.date_trunc("day", col), func.count())
            .where(col >= since_dt)
            .group_by(func.date_trunc("day", col))
        ).all()
        by_day = {d.date(): c for d, c in rows if d}
        return [
            {"day": (since_dt + timedelta(days=i)).date().strftime("%d.%m"),
             "count": by_day.get((since_dt + timedelta(days=i)).date(), 0)}
            for i in range(14)
        ]

    return {
        "total_users": session.exec(select(func.count()).select_from(User)).one(),
        "total_posts": session.exec(select(func.count()).select_from(Post)).one(),
        "total_messages": session.exec(select(func.count()).select_from(Message)).one(),
        "total_likes": session.exec(select(func.count()).select_from(Like)).one(),
        "dau": session.exec(select(func.count()).select_from(User).where(User.last_seen >= now - timedelta(days=1))).one(),
        "mau": session.exec(select(func.count()).select_from(User).where(User.last_seen >= now - timedelta(days=30))).one(),
        "reg_today": session.exec(select(func.count()).select_from(User).where(User.created_at >= today_start)).one(),
        "reg_yesterday": session.exec(select(func.count()).select_from(User).where(User.created_at >= yesterday_start, User.created_at < today_start)).one(),
        "reg_series": day_series(User.created_at, since),
        "post_series": day_series(Post.created_at, since),
        "online": manager.total_connections,
    }


@router.get("/api/admin/stats/users")
def stats_users_list(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Все юзеры с метриками: посты, сообщения, лайки, визиты, KPI"""
    _require_stats_access(staff, session)
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    if not users:
        return []
    ids = [u.id for u in users]
    posts_counts = dict(session.exec(select(Post.author_id, func.count(Post.id)).where(Post.author_id.in_(ids)).group_by(Post.author_id)).all())
    msgs_counts = dict(session.exec(select(Message.sender_id, func.count(Message.id)).where(Message.sender_id.in_(ids)).group_by(Message.sender_id)).all())
    likes_given = dict(session.exec(select(Like.user_id, func.count(Like.id)).where(Like.user_id.in_(ids)).group_by(Like.user_id)).all())
    likes_received = dict(session.exec(
        select(Post.author_id, func.count(Like.id))
        .join(Like, Like.post_id == Post.id)
        .where(Post.author_id.in_(ids))
        .group_by(Post.author_id)
    ).all())
    visits = dict(session.exec(
        select(IPLog.user_id, func.count(IPLog.id))
        .where(IPLog.user_id.in_(ids), IPLog.action.in_(["login", "login_2fa"]))
        .group_by(IPLog.user_id)
    ).all())

    _pre = batch_get_users(users, session)
    result = []
    for u in users:
        p = posts_counts.get(u.id, 0)
        m = msgs_counts.get(u.id, 0)
        lg = likes_given.get(u.id, 0)
        lr = likes_received.get(u.id, 0)
        v = visits.get(u.id, 0)
        result.append({
            **user_out(u, session, _pre.get(u.id)),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "posts_count": p,
            "messages_count": m,
            "likes_given": lg,
            "likes_received": lr,
            "visits_count": v,
            "kpi": _compute_kpi(p, m, lg, lr, v),
        })
    return result


@router.get("/api/admin/team-statistics")
def admin_team_statistics(
    user_id: int = 0,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not (staff.is_admin or staff.is_moderator
            or has_permission(staff, "manage_team_stats", session)):
        raise HTTPException(403, "Нет права: manage_team_stats")

    if user_id:
        # --- детальная статистика сотрудника ---
        actions = session.exec(
            select(ActionLog)
            .where(ActionLog.actor_id == user_id)
            .order_by(ActionLog.id.desc())
            .limit(50)
        ).all()
        role_logs = session.exec(
            select(ActionLog)
            .where(ActionLog.target_type == "user", ActionLog.target_id == user_id)
            .order_by(ActionLog.id.desc())
            .limit(50)
        ).all()
        role_history = []
        for lg in role_logs:
            act = (lg.action or "").lower()
            if "role" not in act:
                continue
            old_role = new_role = None
            try:
                d = json.loads(lg.details or "{}")
                if isinstance(d, dict):
                    old_role = d.get("old_role") or d.get("old")
                    new_role = d.get("new_role") or d.get("new")
            except Exception:
                pass
            actor = session.get(User, lg.actor_id) if lg.actor_id else None
            role_history.append({
                "old_role": old_role, "new_role": new_role,
                "changed_by": actor.username if actor else None,
                "created_at": lg.created_at.isoformat() if lg.created_at else None,
            })
        return {
            "total_actions": len(actions),
            "actions": [
                {"action_type": a.action, "target_type": a.target_type,
                 "target_id": a.target_id,
                 "created_at": a.created_at.isoformat() if a.created_at else None}
                for a in actions
            ],
            "role_history": role_history,
        }

    # --- группы отделов ---
    def _user_brief(u: User) -> dict:
        return {
            "id": u.id, "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            "is_admin": u.is_admin, "is_moderator": u.is_moderator,
            "is_banned": u.is_banned,
        }

    cats = session.exec(select(RoleCategory).order_by(
        RoleCategory.order, RoleCategory.id)).all()
    groups = []
    assigned_user_ids: set = set()
    for cat in cats:
        # 🛡 Берём ВСЕ роли категории (не только is_staff), иначе команда пустует
        roles = session.exec(select(Role).where(
            Role.category_id == cat.id)).all()
        members = []
        for r in roles:
            users_in_role = session.exec(select(User).where(
                User.role_id == r.id, User.is_bot == False)).all()  # noqa: E712
            # сортировка внутри роли: по уровню роли
            for u in users_in_role:
                if u.id in assigned_user_ids:
                    continue
                assigned_user_ids.add(u.id)
                actions_count = session.exec(
                    select(func.count(ActionLog.id))
                    .where(ActionLog.actor_id == u.id)).one() or 0
                members.append({
                    "user": _user_brief(u),
                    "role": {"id": r.id, "name": r.name, "color": r.color,
                             "level": r.level},
                    "actions_count": int(actions_count),
                })
        members.sort(key=lambda m: -(m["role"].get("level") or 0))
        groups.append({"id": cat.id, "name": cat.name, "color": cat.color,
                       "members": members})

    # 🛡 Fallback: юзеры с ролью БЕЗ категории (или админы без роли) —
    # чтобы команда не «пропадала» из-за незаполненных категорий
    fallback = []
    all_users = session.exec(select(User).where(
        User.is_bot == False, User.is_banned == False)).all()  # noqa: E712
    cat_role_ids = {r.id for r in session.exec(select(Role).where(
        Role.category_id.is_not(None))).all()}
    for u in all_users:
        if u.id in assigned_user_ids:
            continue
        r = session.get(Role, u.role_id) if u.role_id else None
        if r and r.id in cat_role_ids:
            continue
        if not (u.is_admin or u.is_moderator or (r and r.is_staff)):
            continue
        actions_count = session.exec(
            select(func.count(ActionLog.id))
            .where(ActionLog.actor_id == u.id)).one() or 0
        fallback.append({
            "user": _user_brief(u),
            "role": ({"id": r.id, "name": r.name, "color": r.color,
                      "level": r.level} if r else None),
            "actions_count": int(actions_count),
        })
    if fallback:
        groups.append({"id": -1, "name": "Без отдела", "color": "#8b5cf6",
                       "members": fallback})
    return {"groups": groups}

