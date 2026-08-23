# ============================================================
# app/routers/support.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

# ============================================================
@router.get("/api/support/tickets")
def support_list_tickets(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Список всех заявок для админки"""
    if not user.is_admin and not has_permission(user, "manage_support", session):
        raise HTTPException(403, "Нет права: manage_support")

    tickets = session.exec(
        select(SupportTicket).order_by(SupportTicket.updated_at.desc())
    ).all()
    if not tickets:
        return []

    ticket_ids = [t.id for t in tickets]
    user_ids = list({t.user_id for t in tickets})
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}

    last_msgs = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id.in_(ticket_ids))
        .order_by(SupportMessage.created_at.desc())
    ).all()
    last_by_ticket = {}
    for m in last_msgs:
        if m.ticket_id not in last_by_ticket:
            last_by_ticket[m.ticket_id] = m

    result = []
    for t in tickets:
        u = users.get(t.user_id)
        last = last_by_ticket.get(t.id)
        result.append({
            "id": t.id,
            "user": user_out(u, session) if u else None,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
            "last_message": {
                "text": (last.text or "📷 Фото")[:60] if last else None,
                "created_at": last.created_at.isoformat() if last else None,
            } if last else None,
        })
    return result


@router.post("/api/support/tickets/{ticket_id}/close")
async def support_close_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Закрыть заявку — автор или саппортер"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    ticket.status = "closed"
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.add(SupportMessage(ticket_id=ticket.id, sender_id=user.id, text="🔒 Заявка закрыта."))
    session.commit()

    if is_staff:
        await manager.broadcast_to_users([ticket.user_id], "support_ticket_closed", {"ticket_id": ticket.id})
    else:
        staff_ids = [u.id for u in session.exec(select(User)).all()
                     if u.is_admin or has_permission(u, "manage_support", session)]
        if staff_ids:
            await manager.broadcast_to_users(staff_ids, "support_ticket_closed", {"ticket_id": ticket.id})
    return {"ok": True}





# ============================================================

@router.post("/api/support/start")
async def support_start(  # <-- СТАЛО async def
    background_tasks: BackgroundTasks,
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать НОВУЮ заявку (разрешено иметь несколько открытых)"""
    ticket = SupportTicket(user_id=user.id, status="open")
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # 🚀 ИСПРАВЛЕННЫЙ БЛОК ЗАГРУЗКИ ФОТО
    media_url = None
    media_type = None
    
    if file and file.filename:
        ext = os.path.splitext(file.filename or "")[1].lower()
        content_type = (file.content_type or "").lower()

        # Если расширения нет, но браузер говорит, что это картинка - верим
        if not ext and content_type.startswith("image/"):
            ext = ".jpg" 

        # 🛡️ ЯВНАЯ ПРОВЕРКА: Если это вообще не картинка - прерываем с понятной ошибкой
        if ext not in ALLOWED_IMAGE_EXT and not content_type.startswith("image/"):
            raise HTTPException(400, f"Неподдерживаемый формат ({ext or 'unknown'}). Разрешены только изображения.")

        # Читаем файл (используем await, так как функция теперь async)
        content = await file.read()

        try:
            # 🚀 format="jpg" заставляет Cloudinary конвертировать HEIC/WebP в обычный JPG
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, 
                    folder="support", 
                    resource_type="image",
                    format="jpg" 
                )
            )
            media_url = result.get("secure_url")
            media_type = "image"
        except Exception as e:
            print(f"[Support] Upload failed: {e}")
            raise HTTPException(400, f"Ошибка загрузки фото: {str(e)}")

    first_text = text.strip() or ("📷 Фото без описания" if media_url else "👋 Привет! Мне нужна помощь.")
    
    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        text=first_text,
        media_url=media_url,
        media_type=media_type,
    )
    session.add(msg)
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.commit()

    # ✅ БЕЗОПАСНАЯ рассылка через BackgroundTasks
    staff_ids = [
        u.id for u in session.exec(select(User)).all()
        if u.is_admin or has_permission(u, "manage_support", session)
    ]
    if staff_ids:
        background_tasks.add_task(
            manager.broadcast_to_users,
            staff_ids,
            "support_new_ticket",
            {"ticket_id": ticket.id, "user_name": user.display_name}
        )

    return {"ticket_id": ticket.id}


@router.post("/api/support/messages")
async def support_send_message(
    background_tasks: BackgroundTasks,  # ← На всякий случай
    ticket_id: int = Form(...),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),  # ← НОВОЕ: фото
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отправить сообщение в заявку (текст + фото)"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")
    if ticket.status != "open":
        raise HTTPException(400, "Заявка закрыта")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    # Загрузка фото
    media_url = None
    media_type = None
    
    if file:
        # 1. Пытаемся получить расширение из имени файла
        ext = os.path.splitext(file.filename or "")[1].lower()
        
        # 2. Если имени нет, проверяем MIME-тип (content_type)
        if not ext and file.content_type:
            if "jpeg" in file.content_type or "jpg" in file.content_type: ext = ".jpg"
            elif "png" in file.content_type: ext = ".png"
            elif "gif" in file.content_type: ext = ".gif"
            elif "webp" in file.content_type: ext = ".webp"
            elif "heic" in file.content_type: ext = ".heic" # Cloudinary умеет конвертировать HEIC!

        # 🛡️ ЯВНАЯ ПРОВЕРКА: Если формат не поддерживается, сразу прерываем с понятной ошибкой
        if ext not in ALLOWED_IMAGE_EXT and not (file.content_type and file.content_type.startswith("image/")):
            raise HTTPException(
                400, 
                f"Неподдерживаемый формат файла ({ext or 'unknown'}). Разрешены: JPG, PNG, GIF, WEBP"
            )
            
        content = await file.read()
        try:
            # Cloudinary сам сконвертирует HEIC/WEBP в JPG, если указать resource_type="image"
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, 
                    folder="support", 
                    resource_type="image",
                    format="jpg" # 🚀 Принудительно конвертируем всё в JPG на стороне Cloudinary
                )
            )
            media_url = result.get("secure_url")
            media_type = "image"
        except Exception as e:
            raise HTTPException(400, f"Ошибка загрузки фото: {str(e)}")

    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        text=text.strip() if text.strip() else None,
        media_url=media_url,
        media_type=media_type,
    )
    session.add(msg)
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.commit()
    session.refresh(msg)

    # Формируем данные для WS
    msg_data = {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "sender_name": user.display_name,
        "sender_is_staff": is_staff,
        "text": msg.text,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "created_at": msg.created_at.isoformat(),
    }

    recipients = []
    if is_author:
        recipients = [u.id for u in session.exec(select(User)).all()
                      if u.is_admin or has_permission(u, "manage_support", session)]
    else:
        recipients = [ticket.user_id]

    if recipients:
        await manager.broadcast_to_users(recipients, "support_new_message", {
            "ticket_id": ticket.id,
            "message": msg_data,
        })

    return {"ok": True, "message": msg_data}


@router.get("/api/support/my-tickets")
def support_my_tickets(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """ВСЕ заявки пользователя (открытые + закрытые)"""
    tickets = session.exec(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.updated_at.desc())
    ).all()

    if not tickets:
        return []

    ticket_ids = [t.id for t in tickets]
    # Последние сообщения для превью
    last_msgs = {}
    all_last = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id.in_(ticket_ids))
        .order_by(SupportMessage.created_at.desc())
    ).all()
    for m in all_last:
        if m.ticket_id not in last_msgs:
            last_msgs[m.ticket_id] = m

    result = []
    for t in tickets:
        last = last_msgs.get(t.id)
        preview = None
        if last:
            if last.media_url and not last.text:
                preview = "📷 Фото"
            else:
                preview = (last.text or "")[:60]
        result.append({
            "id": t.id,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
            "last_message": {
                "text": preview,
                "is_mine": last.sender_id == user.id if last else False,
                "created_at": last.created_at.isoformat() if last else None,
            } if last else None,
        })
    return result


@router.get("/api/support/tickets/{ticket_id}/messages")
def support_ticket_messages(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Сообщения конкретной заявки (для пользователя И админа)"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    messages = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket_id)
        .order_by(SupportMessage.created_at.asc())
    ).all()

    sender_ids = list({m.sender_id for m in messages})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}

    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": senders[m.sender_id].display_name if m.sender_id in senders else "—",
            "sender_is_staff": (
                senders[m.sender_id].is_admin
                or has_permission(senders[m.sender_id], "manage_support", session)
            ) if m.sender_id in senders else False,
            "text": m.text,
            "media_url": m.media_url,
            "media_type": m.media_type,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]

