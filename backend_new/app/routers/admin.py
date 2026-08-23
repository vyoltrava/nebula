# ============================================================
# app/routers/admin.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

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

@router.get("/api/permissions")
def list_permissions():
    return [
        # === Модерация контента ===
        {"id": "delete_posts", "label": "Удалять посты", "category": "content"},
        {"id": "edit_posts", "label": "Редактировать чужие посты", "category": "content"},
        {"id": "remove_avatars", "label": "Удалять аватарки", "category": "content"},
        {"id": "manage_stickers", "label": "Управлять стикер-паками", "category": "content"},
        {"id": "manage_announcements", "label": "Публиковать объявления", "category": "content"},
        
        # === Модерация пользователей ===
        {"id": "ban_users", "label": "Банить пользователей", "category": "users"},
        {"id": "warn_users", "label": "Выдавать предупреждения", "category": "users"},
        {"id": "delete_users", "label": "Удалять пользователей", "category": "users"},
        {"id": "assign_moderator", "label": "Назначать разработчиков", "category": "users"},
        {"id": "assign_roles", "label": "Назначать роли своего отдела", "category": "users"},
        
        # === Чаты и группы ===
        {"id": "pin_messages", "label": "Закреплять сообщения везде", "category": "chats"},
        {"id": "manage_groups", "label": "Администрировать любые группы", "category": "chats"},
        {"id": "manage_support", "label": "Чат поддержки", "category": "chats"},
        
        # === Система ===
        {"id": "manage_roles", "label": "Управлять ролями", "category": "system"},
        {"id": "manage_users", "label": "Доступ к панели управления", "category": "system"},
        {"id": "manage_reports", "label": "Управление жалобами", "category": "system"},
        {"id": "tech_access", "label": "Технический доступ", "category": "system"},
        {"id": "manage_team_stats", "label": "Статистика команды и предложения", "category": "system"}, # 🆕 ДОБАВЛЕНО

    ]




@router.get("/api/roles")
def list_roles(session: Session = Depends(get_session)):
    roles = session.exec(select(Role)).all()
    
    # Сортируем: сначала staff по position, потом остальные по level DESC
    staff_roles = sorted(
        [r for r in roles if r.is_staff],
        key=lambda r: (r.position or 0)
    )
    other_roles = sorted(
        [r for r in roles if not r.is_staff],
        key=lambda r: -(r.level or 0)
    )
    
    sorted_roles = staff_roles + other_roles
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "color": r.color,
            "level": r.level,
            "description": r.description or "",
            "is_staff": r.is_staff,
            "position": r.position or 0,
            "category_id": r.category_id,
            "permissions": json.loads(r.permissions),
        }
        for r in sorted_roles
    ]

@router.post("/api/roles")
def create_role(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    level: int = Form(1),
    description: Optional[str] = Form(None),
    is_staff: bool = Form(False),
    permissions: str = Form("[]"),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    max_lvl = max_level_for(staff, session)
    if level < 1 or level > max_lvl:
        raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")

    if session.exec(select(Role).where(Role.name == name)).first():
        raise HTTPException(400, "Role name already exists")

    position = 0
    if is_staff:
        staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
        position = max([r.position for r in staff_roles], default=0) + 1

    role = Role(
        name=name, color=color, level=level,
        description=description, is_staff=is_staff,
        position=position, permissions=permissions,
        category_id=category_id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@router.patch("/api/roles/{role_id}")
def update_role(
    role_id: int,
    name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    level: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    is_staff: Optional[bool] = Form(None),
    permissions: Optional[str] = Form(None),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    if level is not None:
        max_lvl = max_level_for(staff, session)
        if level < 1 or level > max_lvl:
            raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")
        role.level = level

    if name:
        role.name = name
    if color:
        role.color = color
    if description is not None:
        role.description = description
    if is_staff is not None:
        if is_staff and not role.is_staff:
            staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
            role.position = max([r.position for r in staff_roles], default=0) + 1
        role.is_staff = is_staff
    if permissions:
        role.permissions = permissions
    if category_id is not None:
        role.category_id = category_id if category_id > 0 else None
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@router.delete("/api/roles/{role_id}")
def delete_role(
    role_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    users = session.exec(select(User).where(User.role_id == role_id)).all()
    for u in users:
        u.role_id = None
        session.add(u)
    session.delete(role)
    session.commit()
    invalidate_role_cache()
    return {"ok": True}


@router.post("/api/roles/{role_id}/move")
def move_role(
    role_id: int,
    direction: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
    staff_roles.sort(key=lambda r: ((r.position or 0), -(r.level or 0)))

    # Нормализуем позиции в 1..N — без этого кнопки ↑↓ меняют 0 на 0
    for i, r in enumerate(staff_roles, start=1):
        r.position = i

    idx = next((i for i, r in enumerate(staff_roles) if r.id == role_id), -1)
    if idx == -1:
        raise HTTPException(400, "Роль не отмечена как staff")

    swap_with = None
    if direction == "up" and idx > 0:
        swap_with = staff_roles[idx - 1]
    elif direction == "down" and idx < len(staff_roles) - 1:
        swap_with = staff_roles[idx + 1]

    if swap_with is not None:
        role.position, swap_with.position = swap_with.position, role.position
        session.add(role)
        session.add(swap_with)

    session.commit()
    invalidate_role_cache()
    return {"ok": True}


@router.get("/api/roles/assignable")
def list_assignable_roles(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    roles = assignable_roles_for(staff, session)
    return sorted(
        [
            {
                "id": r.id, "name": r.name, "color": r.color, "level": r.level,
                "category_id": r.category_id, "is_staff": r.is_staff,
            }
            for r in roles
        ],
        key=lambda r: (r["category_id"] or 0, -r["level"]),
    )


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


# ============================================================
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



# ============================================================

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
async def admin_create_pack(
    name: str = Form(...),
    min_level: int = Form(1),
    is_active: bool = Form(True),
    emojis: str = Form("[]"),          # 🆕 JSON-массив эмодзи
    files: List[UploadFile] = File([]), # 🆕 Картинки (можно из папки)
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    
    pack = StickerPack(
        name=name.strip(),
        min_level=min_level,
        is_active=is_active,
        # 🛡️ КРИТИЧЕСКИ ВАЖНО: emojis больше не NOT NULL, но для страховки пишем пустой список
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    
    added = []
    max_order = 0
    
    # 1. Эмодзи
    try:
        emoji_list = json.loads(emojis) if isinstance(emojis, str) else emojis
        if not isinstance(emoji_list, list):
            emoji_list = []
    except Exception:
        emoji_list = []
    
    for e in emoji_list:
        if not e:
            continue
        max_order += 1
        s = Sticker(pack_id=pack.id, type="emoji", content=str(e), order=max_order)
        session.add(s)
        session.commit()
        session.refresh(s)
        added.append({"id": s.id, "type": "emoji", "content": e})
    
    # 2. Картинки
    import cloudinary.uploader
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:  # 5MB на стикер
            continue
        try:
            result = cloudinary.uploader.upload(contents, folder="stickers", resource_type="image")
            url = result["secure_url"]
            max_order += 1
            s = Sticker(pack_id=pack.id, type="image", content=url, order=max_order)
            session.add(s)
            session.commit()
            session.refresh(s)
            added.append({"id": s.id, "type": "image", "content": url})
        except Exception as e:
            print(f"[Stickers] Failed to upload image: {e}")
    
    return {"ok": True, "id": pack.id, "added": added}


@router.put("/api/admin/sticker-packs/{pack_id}")
async def admin_update_pack(
    pack_id: int,
    name: str = Form(...),
    min_level: int = Form(1),
    is_active: bool = Form(True),
    files: List[UploadFile] = File([]),  # 🆕 можно докинуть картинки при редактировании
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
    
    added = []
    if files:
        max_order = session.exec(
            select(func.max(Sticker.order)).where(Sticker.pack_id == pack_id)
        ).one() or 0
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
                added.append({"id": s.id, "type": "image", "content": url})
            except Exception as e:
                print(f"[Stickers] Failed to upload: {e}")
    
    session.commit()
    return {"ok": True, "added": added}


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

# ============================================================
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
            has_immune = any(u.is_admin or u.is_moderator or u.is_trelod for u in chat_users)
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
        has_immune = any(u and (u.is_admin or u.is_moderator or u.is_trelod) for u in member_users)
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



# ============================================================
@router.get("/api/role-categories")
def list_role_categories(session: Session = Depends(get_session)):
    cats = session.exec(select(RoleCategory).order_by(RoleCategory.order, RoleCategory.id)).all()
    return [{"id": c.id, "name": c.name, "color": c.color, "description": c.description, "order": c.order} for c in cats]

@router.post("/api/role-categories")
def create_role_category(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    description: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    max_order = session.exec(select(func.max(RoleCategory.order))).one() or 0
    cat = RoleCategory(name=name.strip(), color=color, description=description.strip() if description else None, order=max_order + 1)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"ok": True, "id": cat.id, "name": cat.name, "color": cat.color, "description": cat.description, "order": cat.order}

@router.put("/api/role-categories/{cat_id}")
def update_role_category(
    cat_id: int,
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    description: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    cat = session.get(RoleCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    cat.name = name.strip()
    cat.color = color
    cat.description = description.strip() if description else None
    session.add(cat)
    session.commit()
    return {"ok": True}

@router.delete("/api/role-categories/{cat_id}")
def delete_role_category(
    cat_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    cat = session.get(RoleCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    session.delete(cat)
    session.commit()
    return {"ok": True}




# ---------- техническая панель ----------

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

@router.get("/api/team")
def get_team(session: Session = Depends(get_session)):
    users = session.exec(
        select(User).where(User.is_banned == False).order_by(User.created_at)
    ).all()

    if not users:
        return {"groups": []}

    # Массовый запрос ролей
    role_ids = list({u.role_id for u in users if u.role_id})
    roles = {
        r.id: r for r in session.exec(
            select(Role).where(Role.id.in_(role_ids))
        ).all()
    } if role_ids else {}

    groups = {
        "level_11": {"label": "System", "color": "#00ff41", "order": 0, "members": []},
        "level_10": {"label": "Founder", "color": "#ffffff", "order": 1, "members": []},
        "level_9": {"label": "Developer", "color": "#3b82f6", "order": 2, "members": []},
        "level_8": {"label": "Глава администрации", "color": "#B91C1C", "order": 3, "members": []},
        "level_7": {"label": "Технический раздел", "color": "#0E7490", "order": 4, "members": []},
        "level_6_3": {"label": "Модерация форума", "color": "#065F46", "order": 5, "members": []},
    }

    for u in users:
        level = get_user_level(u, session)

        member_data = {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "is_admin": u.is_admin,
            "is_moderator": u.is_moderator,
            "is_trelod": u.is_trelod,
            "level": level,
            "role": None,
        }

        if u.role_id:
            role = roles.get(u.role_id)  # ← из словаря, не из БД
            if role:
                member_data["role"] = {"id": role.id, "name": role.name, "color": role.color}

        if level == 11:
            groups["level_11"]["members"].append(member_data)
        elif level == 10:
            groups["level_10"]["members"].append(member_data)
        elif level == 9:
            groups["level_9"]["members"].append(member_data)
        elif level == 8:
            groups["level_8"]["members"].append(member_data)
        elif level == 7:
            groups["level_7"]["members"].append(member_data)
        elif 3 <= level <= 6:
            groups["level_6_3"]["members"].append(member_data)

    result = []
    for key, g in sorted(groups.items(), key=lambda x: x[1]["order"]):
        if g["members"]:
            result.append({
                "key": key,
                "label": g["label"],
                "color": g["color"],
                "members": g["members"],
            })

    return {"groups": result}

@router.get("/api/rules")
def get_rules(session: Session = Depends(get_session)):
    # 1. Пытаемся взять сохранённые правила из БД
    saved = None
    try:
        saved = session.exec(
            select(SiteRules).order_by(SiteRules.id.desc()).limit(1)
        ).first()
        if saved:
            rules_data = json.loads(saved.content)
        else:
            # Дефолтные правила
            rules_data = {
                "title": "Правила сообщества trelod",
                "subtitle": "trelod — пространство для свободного и уважительного общения.",
                "sections": [
                    {"id": "safety", "heading": "1. Безопасность", "items": ["Запрещены угрозы, насилие, ненависть.", "Запрещён терроризм, экстремизм.", "Запрещена пропаганда наркотиков."]},
                    {"id": "respect", "heading": "2. Уважение", "items": ["Запрещены оскорбления, буллинг.", "Запрещён доксинг.", "Запрещена имперсонация."]},
                    {"id": "content", "heading": "3. Контент", "items": ["Запрещён спам, накрутка.", "Запрещён порно-контент.", "Запрещено мошенничество."]},
                    {"id": "punishments", "heading": "4. Меры наказания", "table": [{"num": "1", "measure": "Предупреждение", "description": "Фиксируется на 30 дней.", "violations": "Мелкий спам."}, {"num": "2", "measure": "Блокировка", "description": "От 1 до 30 дней.", "violations": "Повторные нарушения."}], "note": "Администрация применяет меры по своему усмотрению."}
                ],
                "footer": "Используя trelod, вы соглашаетесь с правилами."
            }
    except Exception as e:
        print(f"⚠️ Failed to load rules: {e}")
        rules_data = {"title": "Правила", "sections": [], "footer": ""}

    # 2. 🆕 Загружаем роли администрации (только is_staff=True)
    try:
        staff_roles = session.exec(
            select(Role)
            .where(Role.is_staff == True)
            .order_by(Role.position.asc())
        ).all()

        roles_section = {
            "id": "roles",
            "heading": "Команда trelod",
            "roles": [
                {
                    "name": role.name,
                    "color": role.color,
                    "level": role.level,
                    "description": role.description or "Описание отсутствует"
                }
                for role in staff_roles
            ]
        }
        
        # Добавляем секцию ролей в правила
        if "sections" not in rules_data:
            rules_data["sections"] = []
        rules_data["sections"].append(roles_section)
        
    except Exception as e:
        print(f"⚠️ Failed to load roles: {e}")

    return rules_data


@router.put("/api/rules")
def update_rules(
    data: RulesUpdate,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    # Валидация JSON
    try:
        json.loads(data.content)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Невалидный JSON: {e}")

    try:
        existing = session.exec(
            select(SiteRules).order_by(SiteRules.id.desc()).limit(1)
        ).first()

        if existing:
            existing.content = data.content
            existing.updated_by = user.id
            existing.updated_at = datetime.now(timezone.utc)
            session.add(existing)
        else:
            session.add(SiteRules(content=data.content, updated_by=user.id))

        session.commit()
        return {"ok": True}
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Ошибка сохранения: {str(e)}")

# ---------- жалобы ----------

@router.post("/api/reports")
@limiter.limit("10/minute")
def create_report(
    request: Request,
    target_type: str = Form(...),
    target_id: int = Form(...),
    reason: str = Form(...),
    comment: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Валидация типа
    if target_type not in ("post", "user"):
        raise HTTPException(400, "Invalid target type")
    
    # Валидация причины
    valid_reasons = ["spam", "insult", "nsfw", "rules_violation", "other"]
    if reason not in valid_reasons:
        raise HTTPException(400, "Invalid reason")
    
    # Проверка что цель существует
    if target_type == "post":
        target = session.get(Post, target_id)
        if not target:
            raise HTTPException(404, "Post not found")
        # Нельзя жаловаться на свой пост
        if target.author_id == user.id:
            raise HTTPException(400, "Cannot report your own post")
    else:
        target = session.get(User, target_id)
        if not target:
            raise HTTPException(404, "User not found")
        # Нельзя жаловаться на себя
        if target.id == user.id:
            raise HTTPException(400, "Cannot report yourself")
    
    # Проверка на дубликат жалобы
    existing = session.exec(
        select(Report).where(
            Report.reporter_id == user.id,
            Report.target_type == target_type,
            Report.target_id == target_id,
            Report.status == "pending",
        )
    ).first()
    if existing:
        raise HTTPException(400, "Вы уже пожаловались на это. Жалоба рассматривается.")
    
    report = Report(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        comment=comment,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    
    return {"ok": True, "id": report.id}


@router.get("/api/reports")
def list_reports(
    status: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    query = select(Report).order_by(Report.created_at.desc())
    if status:
        query = query.where(Report.status == status)
    
    reports = session.exec(query.limit(100)).all()
    
    result = []
    for r in reports:
        reporter = session.get(User, r.reporter_id)
        
        target_info = None
        if r.target_type == "post":
            post = session.get(Post, r.target_id)
            if post:
                author = session.get(User, post.author_id)
                target_info = {
                    "type": "post",
                    "id": post.id,
                    "text": post.text[:200] if post.text else "",
                    "author_name": author.display_name if author else "Unknown",
                    "author_id": post.author_id,
                }
        else:
            target_user = session.get(User, r.target_id)
            if target_user:
                target_info = {
                    "type": "user",
                    "id": target_user.id,
                    "username": target_user.username,
                    "display_name": target_user.display_name,
                    "avatar_url": target_user.avatar_url,
                }
        
        result.append({
            "id": r.id,
            "reporter": user_out(reporter, session) if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "target": target_info,
            "reason": r.reason,
            "comment": r.comment,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        })
    
    return result


@router.post("/api/reports/{report_id}/resolve")
async def resolve_report( 
    request: Request,  # ← ДОБАВЬ
    report_id: int,
    action: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")



    if action == "delete_post" and report.target_type == "post":
        if not has_permission(staff, "delete_posts", session):
            raise HTTPException(403, "No permission: delete_posts")
        post = session.get(Post, report.target_id)
        if post:
            # 🛡️ Иммунитет автора поста
            author = session.get(User, post.author_id)
            if author and author.id != staff.id:
                check_sanction_rights(staff, author, session, "удалять посты этого пользователя")
            cascade_delete_post(post.id, session)
    elif action == "ban_user":
        if not has_permission(staff, "ban_users", session):
            raise HTTPException(403, "No permission: ban_users")
        target_user_id = None
        if report.target_type == "user":
            target_user_id = report.target_id
        elif report.target_type == "post":
            post = session.get(Post, report.target_id)
            if post:
                target_user_id = post.author_id
        if target_user_id:
            target = session.get(User, target_user_id)
            if target and target.id != staff.id:
                # 🛡️ Единый иммунитет (Founder/Developer нельзя банить через жалобы)
                check_sanction_rights(staff, target, session, "банить этого пользователя")
                target.is_banned = True
                session.add(target)
    
    elif action != "ignore":
        raise HTTPException(400, "Invalid action")
    
    # Помечаем жалобу как обработанную
    report.status = "resolved"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    
    # Логируем действие
    log_action(
        session, staff.id, f"resolve_report_{action}",
        target_type=report.target_type,
        target_id=report.target_id,
        details={"action": action, "reason": report.reason},
        ip_address=get_client_ip(request) if hasattr(request, 'headers') else None,
    )
    session.commit()
    
    return {"ok": True}


@router.post("/api/reports/{report_id}/reject")
def reject_report(
    report_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")
    
    report.status = "rejected"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    
    return {"ok": True}


# ---------- IP И ЛОГИ ----------

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

@router.post("/api/bugs")
@limiter.limit("5/minute")
def create_bug_report(
    request: Request,
    title: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if len(title.strip()) < 5:
        raise HTTPException(400, "Заголовок должен быть не менее 5 символов")
    if len(description.strip()) < 20:
        raise HTTPException(400, "Описание должно быть не менее 20 символов")
    if priority not in ("low", "medium", "high", "critical"):
        raise HTTPException(400, "Неверный приоритет")
    
    bug = BugReport(
        reporter_id=user.id,
        title=title.strip(),
        description=description.strip(),
        priority=priority,
    )
    session.add(bug)
    session.commit()
    session.refresh(bug)
    
    return {"ok": True, "id": bug.id}


@router.get("/api/bugs")
def list_bugs(
    status: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    query = select(BugReport).order_by(BugReport.created_at.desc())
    if status:
        query = query.where(BugReport.status == status)
    
    bugs = session.exec(query.limit(200)).all()
    
    result = []
    for bug in bugs:
        reporter = session.get(User, bug.reporter_id)
        resolver = session.get(User, bug.resolved_by) if bug.resolved_by else None
        
        result.append({
            "id": bug.id,
            "reporter": user_out(reporter, session) if reporter else None,
            "title": bug.title,
            "description": bug.description,
            "status": bug.status,
            "priority": bug.priority,
            "resolver": user_out(resolver, session) if resolver else None,
            "resolved_at": bug.resolved_at.isoformat() if bug.resolved_at else None,
            "created_at": bug.created_at.isoformat(),
        })
    
    return result


@router.patch("/api/bugs/{bug_id}")
def update_bug_status(
    bug_id: int,
    status: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    if status not in ("new", "in_progress", "resolved", "rejected"):
        raise HTTPException(400, "Неверный статус")
    
    bug = session.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(404, "Bug report not found")
    
    bug.status = status
    
    if status in ("resolved", "rejected"):
        bug.resolved_by = staff.id
        bug.resolved_at = datetime.now(timezone.utc)
    else:
        bug.resolved_by = None
        bug.resolved_at = None
    
    session.add(bug)
    session.commit()
    
    return {"ok": True, "status": bug.status}


@router.delete("/api/bugs/{bug_id}")
def delete_bug(
    bug_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    bug = session.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(404, "Bug report not found")
    
    session.delete(bug)
    session.commit()
    
    return {"ok": True}


@router.get("/api/updates")
def list_updates(
    user: Optional[User] = Depends(get_optional_user),  # ← Изменили get_current_user на get_optional_user
    session: Session = Depends(get_session),
):
    updates = session.exec(select(Update).order_by(Update.created_at.desc())).all()
    if not updates:
        return []

    author_ids = list({u.author_id for u in updates if u.author_id})
    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    } if author_ids else {}

    # 🆕 Получаем список ID прочитанных обновлений для текущего юзера
    read_update_ids = set()
    if user:
        read_rows = session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
        read_update_ids = set(read_rows)

    result = []
    for u in updates:
        author = authors.get(u.author_id)
        result.append({
            "id": u.id,
            "title": u.title,
            "content": u.content,
            "importance": u.importance,
            "author": user_out(author, session) if author else None,
            "created_at": u.created_at.isoformat(),
            "edited_at": u.edited_at.isoformat() if u.edited_at else None,
            "is_read": u.id in read_update_ids,  # ← ДОБАВИЛИ ПОЛЕ
        })
    return result




@router.post("/api/updates/{update_id}/read")
def mark_update_read(
    update_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить обновление как прочитанное"""
    existing = session.exec(
        select(UpdateRead).where(
            UpdateRead.user_id == user.id, 
            UpdateRead.update_id == update_id
        )
    ).first()
    
    if not existing:
        session.add(UpdateRead(user_id=user.id, update_id=update_id))
        session.commit()
    
    return {"ok": True}


@router.post("/api/updates/read-all")
def mark_all_updates_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить ВСЕ обновления как прочитанные"""
    all_updates = session.exec(select(Update.id)).all()
    existing = {
        r.update_id for r in session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
    }
    
    new_ids = set(all_updates) - existing
    
    for uid in new_ids:
        session.add(UpdateRead(user_id=user.id, update_id=uid))
    
    session.commit()
    return {"ok": True, "marked": len(new_ids)}

@router.post("/api/updates")
@limiter.limit("10/minute")
async def create_update( # 👈 ИЗМЕНИЛИ def на async def
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    importance: str = Form("minor"),
    user: User = Depends(require_announcer),
    session: Session = Depends(get_session),
):
    if len(title.strip()) < 3:
        raise HTTPException(400, "Заголовок: минимум 3 символа")
    if len(content.strip()) < 10:
        raise HTTPException(400, "Текст: минимум 10 символов")
    if importance not in ("major", "minor", "patch"):
        raise HTTPException(400, "Неверный тип важности")
        
    update = Update(
        title=title.strip(),
        content=content.strip(),
        importance=importance,
        author_id=user.id,
    )
    session.add(update)
    session.commit()
    session.refresh(update)
    
    # 🆕 РАССЫЛАЕМ СОБЫТИЕ ВСЕМ КЛИЕНТАМ ЧЕРЕЗ WEBSOCKET
    await manager.broadcast_all("new_update", {
        "id": update.id,
        "title": update.title,
        "importance": update.importance
    })
    
    return {"ok": True, "id": update.id}


@router.delete("/api/updates/{update_id}")
def delete_update(
    update_id: int,
    user: User = Depends(require_announcer),   # 🆕 было require_founder
    session: Session = Depends(get_session),
):
    update = session.get(Update, update_id)
    if not update:
        raise HTTPException(404, "Update not found")
    
    # Один запрос вместо N+1
    session.exec(delete(UpdateRead).where(UpdateRead.update_id == update_id))
    session.delete(update)
    session.commit()
    return {"ok": True}

@router.get("/api/badges")
def get_badges(
    user: Optional[User] = Depends(get_optional_user),  # 🆕 ИЗМЕНЕНО: теперь токен не обязателен
    session: Session = Depends(get_session),
):
    """Получить все значки (доступно всем, чтобы фронт мог рендерить аватарки)"""
    badges = session.exec(select(Badge).order_by(Badge.id)).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "icon_url": b.icon_url,
            "glow_color": b.glow_color,
            "effect_type": b.effect_type,
            "role_id": b.role_id,
            "user_id": b.user_id,
            "is_selectable": b.is_selectable,
            # 🆕 Безопасное получение новых полей (на случай, если миграция ещё не прошла)
            "enable_ring": getattr(b, 'enable_ring', True),
            "enable_glow": getattr(b, 'enable_glow', True),
        }
        for b in badges
    ]

@router.post("/api/badges")
async def create_badge(
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать новый значок (только админ)"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    content = await file.read()
    result = await run_in_threadpool(
        lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
    )
    
    badge = Badge(
        name=name,
        icon_url=result["secure_url"],
        glow_color=glow_color if glow_color else None,
        effect_type=effect_type,
        role_id=role_id if role_id else None,
        user_id=user_id if user_id else None,
        is_selectable=is_selectable,
        enable_ring=enable_ring,
        enable_glow=enable_glow,
    )
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}

@router.put("/api/badges/{badge_id}")
async def update_badge(
    badge_id: int,
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновить существующий значок"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    badge.name = name
    badge.glow_color = glow_color if glow_color else None
    badge.effect_type = effect_type
    badge.role_id = role_id if role_id else None
    badge.user_id = user_id if user_id else None
    badge.is_selectable = is_selectable
    badge.enable_ring = enable_ring
    badge.enable_glow = enable_glow
    
    # Если загружен новый файл - обновляем иконку
    if file and file.filename:
        content = await file.read()
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
        )
        badge.icon_url = result["secure_url"]
    
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}



@router.post("/api/admin/stock-badges")
async def admin_upload_stock_badges(
    name: str = Form(...),
    glow_color: str = Form("#8b5cf6"),
    effect_type: str = Form("none"),
    min_level: int = Form(1),
    is_selectable: bool = Form(True),
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Массовая загрузка стоковых значков"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    # Создаём пак для стоковых значков
    pack = StickerPack(
        name=f"Stock: {name}",
        min_level=min_level,
        is_active=True,
        is_builtin=True,
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    
    # Загружаем файлы
    import cloudinary.uploader
    uploaded_count = 0
    
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        
        content = await file.read()
        try:
            result = cloudinary.uploader.upload(content, folder="badges", resource_type="image")
            
            # Создаём бейдж
            badge = Badge(
                name=f"{name} #{uploaded_count + 1}",
                icon_url=result["secure_url"],
                glow_color=glow_color if glow_color else None,
                effect_type=effect_type,
                role_id=None,  # Не привязан к роли
                user_id=None,  # Не привязан к пользователю
                is_selectable=is_selectable,
                enable_ring=True,
                enable_glow=True,
            )
            session.add(badge)
            uploaded_count += 1
        except Exception as e:
            print(f"[Stock Badges] Failed to upload: {e}")
    
    session.commit()
    return {"ok": True, "uploaded": uploaded_count}


@router.delete("/api/badges/{badge_id}")
def admin_delete_badge(
    badge_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    # 🆕 СБРАСЫВАЕМ значок у всех пользователей, у кого он выбран
    users_with_badge = session.exec(
        select(User).where(User.selected_badge_id == badge_id)
    ).all()
    
    for u in users_with_badge:
        u.selected_badge_id = None
        session.add(u)
    
    session.delete(badge)
    session.commit()
    
    # 🆕 РАССЫЛАЕМ всем, что значок удалён
    asyncio.create_task(manager.broadcast_all("badge_deleted", {"badge_id": badge_id}))
    
    return {"ok": True}

# ============================================================

@router.get("/api/admin/team-dashboard/stats")
def get_team_dashboard_stats(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Полная статистика для менеджеров и шефа"""
    # 1. Общие метрики
    total_users = session.exec(select(func.count()).select_from(User)).one()
    total_posts = session.exec(select(func.count()).select_from(Post)).one()
    
    # 2. Регистрации за последние 7 и 30 дней
    now = datetime.now(timezone.utc)
    users_7d = session.exec(select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=7))).one()
    users_30d = session.exec(select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=30))).one()
    
    # 3. Активность команды (действия за 30 дней)
    staff_actions = dict(session.exec(
        select(ActionLog.actor_id, func.count(ActionLog.id))
        .where(ActionLog.created_at >= now - timedelta(days=30))
        .group_by(ActionLog.actor_id)
    ).all())
    
    # 4. Статистика предложений
    suggestions_stats = dict(session.exec(
        select(Suggestion.status, func.count(Suggestion.id))
        .group_by(Suggestion.status)
    ).all())
    
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "registrations_7d": users_7d,
        "registrations_30d": users_30d,
        "staff_actions": staff_actions,
        "suggestions": {
            "pending": suggestions_stats.get("pending", 0),
            "approved": suggestions_stats.get("approved", 0),
            "implemented": suggestions_stats.get("implemented", 0),
            "rejected": suggestions_stats.get("rejected", 0),
            "archived": suggestions_stats.get("archived", 0),
        }
    }
# ============================================================

@router.get("/api/admin/team-statistics")
def get_team_statistics(
    user_id: Optional[int] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Полная статистика команды"""
    if user_id:
        # Статистика конкретного пользователя
        target = session.get(User, user_id)
        if not target:
            raise HTTPException(404, "Пользователь не найден")
        
        # История ролей
        role_history = session.exec(
            select(RoleHistory).where(RoleHistory.user_id == user_id)
            .order_by(RoleHistory.changed_at.desc())
        ).all()
        
        # Действия
        actions = session.exec(
            select(TeamStatistic).where(TeamStatistic.user_id == user_id)
            .order_by(TeamStatistic.created_at.desc()).limit(50)
        ).all()
        
        return {
            "user": user_out(target, session),
            "role_history": [{
                "old_role": session.get(Role, h.old_role_id).name if h.old_role_id else None,
                "new_role": session.get(Role, h.new_role_id).name if h.new_role_id else None,
                "changed_by": user_out(session.get(User, h.changed_by), session),
                "changed_at": h.changed_at.isoformat(),
            } for h in role_history],
            "actions": [{
                "action_type": a.action_type,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "details": json.loads(a.details) if a.details else None,
                "created_at": a.created_at.isoformat(),
            } for a in actions],
            "total_actions": session.exec(
                select(func.count(TeamStatistic.id)).where(
                    TeamStatistic.user_id == user_id
                )
            ).one(),
        }
    else:
        # Общая статистика
        staff_users = session.exec(
            select(User).where(
                (User.is_admin == True) | (User.is_moderator == True) | (User.role_id != None)
            )
        ).all()
        
        result = []
        for u in staff_users:
            role = session.get(Role, u.role_id) if u.role_id else None
            actions_count = session.exec(
                select(func.count(TeamStatistic.id)).where(
                    TeamStatistic.user_id == u.id
                )
            ).one()
            
            result.append({
                "user": user_out(u, session),
                "role": {"name": role.name, "color": role.color, "level": role.level} if role else None,
                "actions_count": actions_count,
                "last_seen": u.last_seen.isoformat() if u.last_seen else None,
            })
        
        return {"members": result}

@router.get("/api/admin/statistics/overview")
def get_statistics_overview(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Общая статистика платформы для менеджеров"""
    # Регистрации за период
    now = datetime.now(timezone.utc)
    registrations_24h = session.exec(
        select(func.count(User.id)).where(
            User.created_at >= now - timedelta(hours=24)
        )
    ).one()
    
    registrations_7d = session.exec(
        select(func.count(User.id)).where(
            User.created_at >= now - timedelta(days=7)
        )
    ).one()
    
    registrations_30d = session.exec(
        select(func.count(User.id)).where(
            User.created_at >= now - timedelta(days=30)
        )
    ).one()
    
    # Активность
    posts_24h = session.exec(
        select(func.count(Post.id)).where(
            Post.created_at >= now - timedelta(hours=24)
        )
    ).one()
    
    # Действия модерации
    mod_actions_24h = session.exec(
        select(func.count(ActionLog.id)).where(
            ActionLog.created_at >= now - timedelta(hours=24)
        )
    ).one()
    
    # Онлайн
    online_count = manager.total_connections
    
    return {
        "registrations": {
            "24h": registrations_24h,
            "7d": registrations_7d,
            "30d": registrations_30d,
        },
        "activity": {
            "posts_24h": posts_24h,
            "mod_actions_24h": mod_actions_24h,
        },
        "online": {
            "count": online_count,
        },
        "totals": {
            "users": session.exec(select(func.count(User.id))).one(),
            "posts": session.exec(select(func.count(Post.id))).one(),
            "chats": session.exec(select(func.count(Chat.id))).one(),
        },
    }
