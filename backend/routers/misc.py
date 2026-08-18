from dependencies import get_author_role, get_current_user, get_user_level, has_permission, require_admin, require_staff
# app_split/routers/misc.py
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

@router.get("/debug/perf")
async def debug_perf():
    return JSONResponse(get_perf_summary())


@router.get("/health")
def health_check():
    return {"status": "ok", "service": "nebula-api"}


@router.get("/api/bookmarks")
def list_bookmarks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    bookmarks = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc())
    ).all()

    if not bookmarks:
        return []

    post_ids = [b.post_id for b in bookmarks]

    # 1. Массовый запрос постов
    posts = session.exec(select(Post).where(Post.id.in_(post_ids))).all()
    posts_map = {p.id: p for p in posts}

    # 2. Массовый запрос авторов
    author_ids = list({p.author_id for p in posts})
    authors = session.exec(select(User).where(User.id.in_(author_ids))).all()
    authors_map = {u.id: u for u in authors}

    # 3. Массовые счётчики лайков и ответов
    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(post_ids)).group_by(Like.post_id)
    ).all())

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(post_ids)).group_by(Post.reply_to_id)
    ).all())

    # 4. Какие из них лайкнуты текущим пользователем
    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    ).all())

    result = []
    # Сохраняем порядок закладок (от новых к старым)
    for b in bookmarks:
        post = posts_map.get(b.post_id)
        if not post:
            continue
        author = authors_map.get(post.author_id)

        result.append({
            "id": post.id,
            "author_id": post.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": post.text,
            "media_url": post.media_url,
            "likes_count": likes_map.get(post.id, 0),
            "liked_by_me": post.id in liked_ids,
            "bookmarked": True,
            "replies_count": replies_map.get(post.id, 0),
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post'
            "views_count": post.views_count or 0,
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post' и добавили безопасный .isoformat() для времени
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "media_type": post.media_type,  # 🆕
        })
        
    return result


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


@router.get("/api/sticker-packs")
def get_sticker_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Паки стикеров с учётом уровня пользователя"""
    packs = session.exec(
        select(StickerPack).where(StickerPack.is_active == True).order_by(StickerPack.id)
    ).all()
    user_level = get_user_level(user, session)
    
    result = []
    for p in packs:
        locked = (user_level < p.min_level) and not user.is_admin
        # Загружаем стикеры пака
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        
        result.append({
            "id": p.id,
            "name": p.name,
            "min_level": p.min_level,
            "locked": locked,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
            } for s in stickers],
        })
    
    return result


@router.get("/api/keys/me")
def get_my_public_key(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    key = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if not key:
        raise HTTPException(404, "Ключ не зарегистрирован")
    return {"public_key": key.public_key, "fingerprint": key.fingerprint}


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
            "is_system": u.is_system,
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

# ---------- правила ----------

def _strip_roles_sections(rules_data: dict) -> dict:
    """Убирает из JSON правил запёкшуюся секцию команды — роли рендерятся отдельно"""
    if rules_data and isinstance(rules_data.get("sections"), list):
        rules_data["sections"] = [
            s for s in rules_data["sections"]
            if not (
                (s.get("id") in ("roles", "team", "staff"))
                or ("команда" in str(s.get("heading", "")).lower())
            )
        ]
    return rules_data


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


class RulesUpdate(BaseModel):
    content: str


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


@router.get("/api/online-count")
def get_online_count(user: User = Depends(get_current_user)):
    """Сколько пользователей сейчас онлайн"""
    return {"count": manager.total_connections}
