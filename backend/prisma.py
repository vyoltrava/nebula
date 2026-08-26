# ============================================================
# ✨ PRISME CHAT — ядро системы "выбора объекта как ключа доступа"
#
#   Генерируется осмысленная SVG-картинка с ретро-футуристичными
#   объектами (робот, ракета, кассета, дискета, джойстик, неон...).
#   Каждый объект — самостоятельный <g> с уникальным data-slot (ключ).
#   Свободный объект можно выбрать как ключ доступа к новому чату.
#   Когда все объекты заняты — пользователь оставляет заявку в очереди,
#   а администратор расширяет картинку новыми объектами.
# ============================================================

import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import (
    User, Chat, ChatMember, Message, Notification,
    PrismeScene, PrismeObject, PrismeRequest, PrismeStat,
)
from main import get_current_user, log_action  # переиспользуем авторизацию из main.py

router = APIRouter(tags=["prisme"])


def utcnow():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------
# 🎨 Палитра и типы объектов (ретро-футуризм / синтвейв / Memphis)
# ------------------------------------------------------------------
PRISME_COLORS = ["#00F5FF", "#FF006E", "#B026FF", "#39FF14", "#FF9900", "#FFE600"]
PRISME_KINDS = [
    "rocket", "robot", "cassette", "floppy", "joystick", "monitor",
    "neon", "laser", "hologram", "star", "zap", "ring", "satellite", "gamepad",
]
PRISME_KIND_LABELS = {
    "rocket": "Ракета", "robot": "Робот", "cassette": "Кассета",
    "floppy": "Дискета", "joystick": "Джойстик", "monitor": "Монитор",
    "neon": "Неон", "laser": "Лазер", "hologram": "Голограмма",
    "star": "Звезда", "zap": "Молния", "ring": "Кольцо",
    "satellite": "Спутник", "gamepad": "Геймпад",
}

# Сетка картинки (viewBox)
PRISME_W = 1200
PRISME_H = 800
PRISME_COLS = 6
PRISME_MARGIN = 90
PRISME_CELL_W = (PRISME_W - PRISME_MARGIN * 2) / PRISME_COLS
PRISME_CELL_H = 156
PRISME_ROWS = 6


# ------------------------------------------------------------------
# 🔢 Детерминированная генерация (seed → позиции/цвета)
# ------------------------------------------------------------------
def _hash_str(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _rand(state: int) -> int:
    state ^= (state << 13) & 0xFFFFFFFF
    state ^= state >> 17
    state ^= (state << 5) & 0xFFFFFFFF
    return state & 0xFFFFFFFF


def _mix(scene_seed: str, salt: str, slot: int) -> int:
    return _hash_str(f"{scene_seed}|{salt}|{slot}")


def _coord(slot: int, count: int):
    """Раскладывает слоты по сетке без пересечений + детерминированный джиттер."""
    cols = PRISME_COLS if count > PRISME_COLS else max(2, min(count, PRISME_COLS))
    col = slot % cols
    row = (slot // cols) % PRISME_ROWS
    cx = PRISME_MARGIN + col * PRISME_CELL_W + PRISME_CELL_W / 2
    cy = PRISME_MARGIN + row * PRISME_CELL_H + PRISME_CELL_H / 2
    r = _mix("jitter", "xy", slot)
    jx = (r % 26) - 13
    jy = ((r >> 6) % 26) - 13
    return round(cx + jx, 2), round(cy + jy, 2)


def _pick(scene_seed: str, slot: int, arr) -> int:
    return _mix(scene_seed, "pick", slot) % len(arr)


# -------------------------------------------------------------------------
# 🧩 Отрисовка каждого объекта как <g> (узнаваемые предметы, неоновый glow)
# -------------------------------------------------------------------------
def _draw_object(slot: int, kind: str, x: float, y: float, size: float,
                 color: str, rot: float, occupied: bool) -> str:
    s = size
    body = "#F5F1E6"
    dark = "#0A0E27"
    title_text = ("ЗАНЯТ" if occupied else "СВОБОДНО") + " · Ключ #" + str(slot)
    cls = "prisme-object " + ("prisme-occupied" if occupied else "prisme-free")

    shapes = []
    if kind == "rocket":
        shapes = [
            f'<path d="M0,{-s} C{s*0.6},{-s*0.2} {s*0.35},{s*0.4} 0,{s} C{-s*0.35},{s*0.4} {-s*0.6},{-s*0.2} 0,{-s} Z" fill="{body}"/>',
            f'<ellipse cx="0" cy="{-s*0.2}" rx="{s*0.16}" ry="{s*0.3}" fill="{color}"/>',
            f'<circle cx="0" cy="{-s*0.95}" r="{s*0.13}" fill="#FFE600"/>',
            f'<path d="M{-s*0.34},{s*0.25} L{-s*0.9},{s*0.85} L{-s*0.26},{s*0.3} Z" fill="{color}"/>',
            f'<path d="M{s*0.34},{s*0.25} L{s*0.9},{s*0.85} L{s*0.26},{s*0.3} Z" fill="{color}"/>',
        ]
    elif kind == "robot":
        shapes = [
            f'<rect x="{-s*0.5}" y="{-s*1.0}" width="{s}" height="{s*0.74}" rx="{s*0.3}" fill="{body}"/>',
            f'<rect x="{-s*0.5}" y="{-s*0.18}" width="{s}" height="{s*0.85}" rx="{s*0.2}" fill="{body}"/>',
            f'<circle cx="{-s*0.2}" cy="{-s*0.62}" r="{s*0.16}" fill="{color}"/>',
            f'<circle cx="{s*0.2}" cy="{-s*0.62}" r="{s*0.16}" fill="{color}"/>',
            f'<rect x="{-s*0.64}" y="{-s*0.04}" width="{s*0.26}" height="{s*0.5}" rx="{s*0.05}" fill="{color}"/>',
            f'<rect x="{s*0.38}" y="{-s*0.04}" width="{s*0.26}" height="{s*0.5}" rx="{s*0.05}" fill="{color}"/>',
            f'<rect x="{-s*0.12}" y="{-s*0.24}" width="{s*0.24}" height="{s*0.44}" rx="{s*0.06}" fill="{color}"/>',
        ]
    elif kind == "cassette":
        shapes = [
            f'<rect x="{-s}" y="{-s*0.65}" width="{s*2}" height="{s*1.3}" rx="{s*0.18}" fill="{body}"/>',
            f'<circle cx="{-s*0.5}" cy="{s*0.12}" r="{s*0.42}" fill="{dark}"/>',
            f'<circle cx="{s*0.5}" cy="{s*0.12}" r="{s*0.42}" fill="{dark}"/>',
            f'<rect x="{-s*0.9}" y="{-s*0.5}" width="{s*1.8}" height="{s*0.22}" fill="{color}"/>',
            f'<rect x="{-s*0.55}" y="{-s*0.5}" width="{s*0.22}" height="{s*0.66}" fill="{dark}"/>',
        ]
    elif kind == "floppy":
        shapes = [
            f'<rect x="{-s}" y="{-s}" width="{s*2}" height="{s*1.9}" rx="{s*0.12}" fill="{body}"/>',
            f'<rect x="{-s*0.7}" y="{-s*0.3}" width="{s*0.6}" height="{s*0.8}" fill="{color}"/>',
            f'<rect x="{-s*0.72}" y="{-s*0.9}" width="{s*1.44}" height="{s*0.5}" rx="{s*0.08}" fill="{color}"/>',
            f'<rect x="{-s*0.26}" y="{-s*1.16}" width="{s*0.52}" height="{s*0.38}" rx="{s*0.06}" fill="{dark}"/>',
        ]
    elif kind == "joystick":
        shapes = [
            f'<rect x="{-s*0.9}" y="{s*0.2}" width="{s*1.8}" height="{s*0.4}" rx="{s*0.1}" fill="{body}"/>',
            f'<circle cx="0" cy="{-s*0.2}" r="{s*0.55}" fill="{body}"/>',
            f'<circle cx="0" cy="{-s*0.2}" r="{s*0.28}" fill="{color}"/>',
            f'<circle cx="{-s*0.65}" cy="{s*0.4}" r="{s*0.16}" fill="{color}"/>',
            f'<circle cx="{s*0.65}" cy="{s*0.4}" r="{s*0.16}" fill="{color}"/>',
        ]
    elif kind == "neon":
        shapes = [
            f'<rect x="{-s}" y="{-s*0.8}" width="{s*2}" height="{s*0.9}" rx="{s*0.12}" fill="{dark}"/>',
            f'<text x="0" y="{s*0.05}" font-family="monospace" font-size="{s*0.72}" font-weight="bold" text-anchor="middle" fill="{color}">NEON</text>',
            f'<rect x="{-s}" y="{-s*0.8}" width="{s*2}" height="{s*0.9}" rx="{s*0.12}" fill="none" stroke="{color}" stroke-width="{s*0.08}"/>',
        ]
    elif kind == "laser":
        shapes = [
            f'<rect x="{-s*0.3}" y="{-s}" width="{s*0.6}" height="{s*2}" rx="{s*0.15}" fill="{body}"/>',
            f'<path d="M0,{-s*0.9} L{s*0.9},{-s*0.2} L{s*0.5},{s*0.9} L{-s*0.5},{s*0.9} L{-s*0.9},{-s*0.2} Z" fill="none" stroke="{color}" stroke-width="{s*0.14}"/>',
            f'<circle cx="0" cy="{-s*0.85}" r="{s*0.18}" fill="{color}"/>',
        ]
    elif kind == "hologram":
        shapes = [
            f'<ellipse cx="0" cy="{s*0.5}" rx="{s*0.7}" ry="{s*0.22}" fill="{color}" opacity="0.7"/>',
            f'<rect x="{-s*0.6}" y="{-s*0.9}" width="{s*1.2}" height="{s*0.5}" fill="{color}" opacity="0.85"/>',
            f'<path d="M{-s*0.4},{-s*0.15} L{s*0.4},{-s*0.15} L0,{s*0.5} Z" fill="{color}" opacity="0.5"/>',
            f'<path d="M0,{-s*0.15} L{s*0.3},{s*0.25} L{-s*0.3},{s*0.25} Z" fill="{body}"/>',
        ]
    elif kind == "star":
        pts = []
        for i in range(10):
            ang = i * math.pi / 5 - math.pi / 2
            rr = s if i % 2 == 0 else s * 0.45
            pts.append(f"{round(rr*math.cos(ang),2)},{round(rr*math.sin(ang),2)}")
        shapes = [
            f'<polygon points="{" ".join(pts)}" fill="{color}"/>',
            f'<circle cx="0" cy="0" r="{s*0.16}" fill="#FFFFFF" opacity="0.9"/>',
        ]
    elif kind == "zap":
        shapes = [
            f'<path d="M{s*0.1},{-s} L{-s*0.5},{s*0.1} L{s*0.05},{s*0.1} L{-s*0.1},{s} L{s*0.6},{-s*0.1} L{s*0.1},{-s*0.1} Z" fill="{color}"/>',
        ]
    elif kind == "ring":
        shapes = [
            f'<circle cx="0" cy="0" r="{s*0.75}" fill="none" stroke="{color}" stroke-width="{s*0.28}"/>',
            f'<ellipse cx="0" cy="{s*0.12}" rx="{s*1.25}" ry="{s*0.35}" fill="none" stroke="{body}" stroke-width="{s*0.16}"/>',
            f'<circle cx="{-s*0.9}" cy="{s*0.15}" r="{s*0.18}" fill="{color}"/>',
        ]
    elif kind == "satellite":
        shapes = [
            f'<rect x="{-s*0.5}" y="{-s*0.9}" width="{s}" height="{s*0.9}" rx="{s*0.2}" fill="{body}"/>',
            f'<rect x="{-s*1.1}" y="{-s*0.8}" width="{s*0.7}" height="{s*0.24}" fill="{color}"/>',
            f'<rect x="{s*0.4}" y="{-s*0.8}" width="{s*0.7}" height="{s*0.24}" fill="{color}"/>',
            f'<circle cx="{-s*0.7}" cy="{s*0.1}" r="{s*0.14}" fill="{color}"/>',
            f'<circle cx="{s*0.7}" cy="{s*0.1}" r="{s*0.14}" fill="{color}"/>',
        ]
    else:  # gamepad
        shapes = [
            f'<path d="M{-s},{-s*0.45} Q{-s},{s*0.25} {-s*0.35},{s*0.25} L{-s*0.15},{s*0.05} L{s*0.15},{s*0.05} L{s*0.35},{s*0.25} Q{s},{s*0.25} {s},{-s*0.45} Q{s},{-s} {s*0.5},{-s} L{-s*0.5},{-s} Q{-s},{-s} {-s},{-s*0.45} Z" fill="{body}"/>',
            f'<circle cx="{-s*0.45}" cy="{-s*0.32}" r="{s*0.16}" fill="{color}"/>',
            f'<circle cx="{s*0.45}" cy="{-s*0.32}" r="{s*0.16}" fill="{color}"/>',
            f'<path d="M{-s*0.1},{-s*0.5} L{s*0.1},{-s*0.35} L{-s*0.1},{-s*0.2} Z" fill="{color}"/>',
        ]

    body_svg = "\n    ".join(shapes)

    lock = ""
    dim = ""
    if occupied:
        dim = f'<rect x="{-s*1.3}" y="{-s*1.3}" width="{s*2.6}" height="{s*2.6}" fill="#0a0e27" opacity="0.55"/>'
        lock = (
            f'<g stroke="#FF006E" stroke-width="{max(1.5, s*0.12)}" opacity="0.95">'
            f'<path d="M{-s*0.42},{-s*0.2} L{-s*0.42},{-s*0.3} A{s*0.42},{s*0.42} 0 0 1 {s*0.42},{-s*0.3} L{s*0.42},{-s*0.2} Z" fill="rgba(255,0,110,0.22)"/>'
            f'<rect x="{-s*0.42}" y="{-s*0.2}" width="{s*0.84}" height="{s*0.42}" rx="{s*0.1}" fill="rgba(255,0,110,0.32)"/></g>'
        )

    return (
        f'<g class="{cls}" data-slot="{slot}" data-kind="{kind}" '
        f'transform="translate({x},{y}) rotate({rot})">'
        f'<title>{title_text}</title>{dim}{body_svg}{lock}</g>'
    )
def _stars_svg(scene_seed: str, n: int = 48) -> str:
    r = _hash_str(scene_seed + "|stars")
    out = []
    for _ in range(n):
        r = _rand(r)
        x = r % PRISME_W
        r = _rand(r)
        y = r % int(PRISME_H * 0.6)
        r = _rand(r)
        op = 0.2 + (r % 5) * 0.18
        out.append(f'<circle cx="{x}" cy="{y}" r="1.5" fill="#FFFFFF" opacity="{round(min(1.0, op),2)}"/>')
    return "\n".join(out)


def _grid_lines() -> str:
    lines = []
    for i in range(0, PRISME_W + 1, 60):
        shrink = i * 0.06
        lines.append(f'<line x1="{i}" y1="{PRISME_H}" x2="{round(i - shrink,1)}" y2="{PRISME_H*0.74}" stroke="rgba(0,245,255,0.10)"/>')
    for j in range(int(PRISME_H * 0.72), PRISME_H + 1, 34):
        lines.append(f'<line x1="0" y1="{j}" x2="{PRISME_W}" y2="{j}" stroke="rgba(176,38,255,0.09)"/>')
    return "\n".join(lines)


def build_scene_svg(scene: PrismeScene, objects: list) -> str:
    """Собирает полный SVG: ретро-фон + объекты (каждый = <g data-slot>)."""
    objs = "\n".join(
        _draw_object(o.slot, o.kind, o.x, o.y, o.size, o.color, o.rotation, o.status == "occupied")
        for o in objects
    )
    free_n = sum(1 for o in objects if o.status == "free")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PRISME_W} {PRISME_H}" '
        f'width="{PRISME_W}" height="{PRISME_H}" role="img" aria-label="Prisme grid">'
        f'<defs>'
        f'<linearGradient id="prisme-sun" x1="0%" y1="0%" x2="0%" y2="100%">'
        f'<stop offset="0%" stop-color="#1A0B2E"/><stop offset="45%" stop-color="#B026FF" stop-opacity="0.55"/>'
        f'<stop offset="72%" stop-color="#FF006E" stop-opacity="0.5"/><stop offset="100%" stop-color="#FF9900" stop-opacity="0.85"/>'
        f'</linearGradient>'
        f'<radialGradient id="prisme-glow" cx="50%" cy="18%" r="65%">'
        f'<stop offset="0%" stop-color="#00F5FF" stop-opacity="0.30"/><stop offset="100%" stop-color="transparent"/>'
        f'</radialGradient>'
        f'</defs>'
        f'<rect width="{PRISME_W}" height="{PRISME_H}" fill="url(#prisme-sun)"/>'
        f'<rect width="{PRISME_W}" height="{PRISME_H}" fill="url(#prisme-glow)"/>'
        f'{_stars_svg(scene.seed)}'
        f'<g>{_grid_lines()}</g>'
        f'<polygon points="{PRISME_W-20},0 {PRISME_W-110},0 {PRISME_W-40},90" fill="rgba(0,245,255,0.06)"/>'
        f'<polygon points="0,{PRISME_H-20} 110,{PRISME_H-20} 0,{PRISME_H-110}" fill="rgba(176,38,255,0.07)"/>'
        f'<g font-family="monospace" font-size="15">'
        f'<rect x="{PRISME_W-262}" y="16" width="244" height="34" rx="8" fill="#0A0E27" opacity="0.62"/>'
        f'<circle cx="{PRISME_W-240}" cy="33" r="6" fill="#39FF14"/>'
        f'<text x="{PRISME_W-224}" y="38" fill="#39FF14">FREE: {free_n}</text>'
        f'<circle cx="{PRISME_W-72}" cy="33" r="6" fill="#FF006E"/>'
        f'<text x="{PRISME_W-56}" y="38" fill="#FF006E">{len(objects)-free_n}</text>'
        f'</g>'
        f'{objs}'
        f'</svg>'
    )


# ------------------------------------------------------------------
# 🛠 Хелперы чтения и обновления сцены
# ------------------------------------------------------------------
def _get_stat(session: Session, scene_id: int, key: str) -> PrismeStat:
    row = session.exec(
        select(PrismeStat).where(PrismeStat.scene_id == scene_id, PrismeStat.key == key)
    ).first()
    if not row:
        row = PrismeStat(scene_id=scene_id, key=key, value=0)
        session.add(row)
        session.commit()
        session.refresh(row)
    return row


def _bump(session: Session, scene_id: int, key: str, by: int = 1):
    row = _get_stat(session, scene_id, key)
    row.value += by
    session.add(row)
    session.commit()
    session.refresh(row)


def _layout(scene: PrismeScene, o: PrismeObject, slot: int) -> PrismeObject:
    """Пересчитывает геометрию слота на сетке (детерминированно)."""
    count = scene.object_count if scene.object_count else 12
    x, y = _coord(slot, count)
    o.x = x
    o.y = y
    r = _mix(scene.seed, "size", slot)
    o.size = 46 + (r % 34)
    o.rotation = round(((r >> 6) % 24) - 12, 1)
    return o


def _ensure_scene(session: Session) -> PrismeScene:
    scene = session.exec(select(PrismeScene).order_by(PrismeScene.id).limit(1)).first()
    if not scene:
        scene = PrismeScene(name="Prisme Grid", seed="retro-1987", base_count=12, object_count=12, expansion_level=0)
        session.add(scene)
        session.commit()
        session.refresh(scene)
        _sync_objects(session, scene)
    return scene


def _all_objects(session: Session, scene: PrismeScene) -> list:
    return list(session.exec(
        select(PrismeObject).where(PrismeObject.scene_id == scene.id).order_by(PrismeObject.slot)
    ).all())


def _free_objects(session: Session, scene: PrismeScene) -> list:
    return list(session.exec(
        select(PrismeObject).where(
            PrismeObject.scene_id == scene.id, PrismeObject.status == "free"
        ).order_by(PrismeObject.slot)
    ).all())


def _sync_objects(session: Session, scene: PrismeScene):
    """Достраивает недостающие (после расширения) слоты, обновляет геометрию свободных."""
    have = _all_objects(session, scene)
    have_map = {o.slot: o for o in have}
    for o in have:
        if o.status == "free":
            _layout(scene, o, o.slot)
            session.add(o)
    for slot in range(scene.object_count):
        o = have_map.get(slot)
        if o is None:
            kind = PRISME_KINDS[_pick(scene.seed, slot, PRISME_KINDS)]
            color = PRISME_COLORS[_pick(scene.seed, slot, PRISME_COLORS)]
            new_o = PrismeObject(scene_id=scene.id, slot=slot, kind=kind, color=color,
                                 status="free", added_at=scene.expansion_level)
            _layout(scene, new_o, slot)
            session.add(new_o)
    for o in have:  # лишние свободные слоты — удаляем
        if o.slot >= scene.object_count and o.status == "free":
            session.delete(o)
    session.commit()


def _object_out(o: PrismeObject) -> dict:
    return {
        "id": o.id,
        "slot": o.slot,
        "kind": o.kind,
        "label": PRISME_KIND_LABELS.get(o.kind, o.kind),
        "x": o.x, "y": o.y, "size": o.size, "rotation": o.rotation,
        "color": o.color,
        "status": o.status,
        "added_at": o.added_at,
        "owner_id": o.owner_id,
        "chat_id": o.chat_id,
    }


def _scene_payload(session: Session, scene: PrismeScene, user: Optional[User] = None) -> dict:
    objs = _all_objects(session, scene)
    svg = build_scene_svg(scene, objs)
    free_n = sum(1 for o in objs if o.status == "free")
    chats_stat = _get_stat(session, scene.id, "chats_created").value
    reqs_stat = _get_stat(session, scene.id, "requests_total").value
    keys_stat = _get_stat(session, scene.id, "keys_total").value

    # Имена владельцев (подсказка, чей ключ висит на объекте)
    owner_ids = {o.owner_id for o in objs if o.owner_id}
    users = {}
    if owner_ids:
        us = session.exec(select(User).where(User.id.in_(list(owner_ids)))).all()
        users = {u.id: u for u in us}

    # Чаты, где текущий пользователь уже участник
    member_of: set = set()
    if user:
        cids = [o.chat_id for o in objs if o.chat_id]
        if cids:
            ms = session.exec(select(ChatMember).where(
                ChatMember.user_id == user.id, ChatMember.chat_id.in_(cids)
            )).all()
            member_of = {m.chat_id for m in ms}

    out_objects = []
    for o in objs:
        d = _object_out(o)
        u = users.get(o.owner_id)
        d["owner_username"] = u.username if u else None
        d["owner_display_name"] = u.display_name if u else None
        d["i_am_member"] = bool(o.chat_id and o.chat_id in member_of)
        out_objects.append(d)

    # Мои личные ключи (объекты, привязанные к моим prisme-чатам)
    my_keys = [
        {"object_id": o.id, "slot": o.slot, "kind": o.kind, "chat_id": o.chat_id}
        for o in objs
        if user and o.owner_id == user.id and o.chat_id
    ]

    # Prisme-чаты, где я участник, но СВОЙ ключ ещё не поставил
    awaiting_my_key = []
    if user:
        keyed_chats = {k["chat_id"] for k in my_keys}
        seen: set = set()
        links = session.exec(select(ChatMember).where(ChatMember.user_id == user.id)).all()
        for ln in links:
            if ln.chat_id in keyed_chats or ln.chat_id in seen:
                continue
            ch = session.get(Chat, ln.chat_id)
            if not ch or not getattr(ch, "is_prism", False):
                continue
            seen.add(ln.chat_id)
            om = session.exec(select(ChatMember).where(
                ChatMember.chat_id == ch.id, ChatMember.user_id != user.id
            )).first()
            partner = session.get(User, om.user_id) if om else None
            awaiting_my_key.append({
                "chat_id": ch.id,
                "name": ch.name,
                "partner_username": partner.username if partner else None,
                "partner_display_name": partner.display_name if partner else None,
            })

    return {
        "scene_id": scene.id,
        "name": scene.name,
        "seed": scene.seed,
        "svg": svg,
        "object_count": len(objs),
        "base_count": scene.base_count,
        "expansion_level": scene.expansion_level,
        "free_count": free_n,
        "occupied_count": len(objs) - free_n,
        "chats_created": chats_stat,
        "requests_total": reqs_stat,
        "keys_total": keys_stat,
        "my_keys": my_keys,
        "awaiting_my_key": awaiting_my_key,
        "objects": out_objects,
    }


def _admin_required(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin:
        raise HTTPException(403, "Только для администраторов")
    return user
# ------------------------------------------------------------------
# 📦 Входные модели
# ------------------------------------------------------------------
class PrismeChatIn(BaseModel):
    object_id: int
    other_user_id: int


class PrismeKeyIn(BaseModel):
    object_id: int
    chat_id: int


class PrismeRequestIn(BaseModel):
    message: Optional[str] = None


class PrismeExpandIn(BaseModel):
    count: int = 6


class PrismeResolveIn(BaseModel):
    action: str = "grant"  # grant | dismiss


# ------------------------------------------------------------------
# 🚀 Эндпоинты PRISME
# ------------------------------------------------------------------
@router.get("/prisme/scene")
def get_prisme_scene(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Сцена: SVG-картинка + список объектов со статусами + мини-статистика."""
    scene = _ensure_scene(session)
    return _scene_payload(session, scene, user)


@router.post("/prisme/chat")
def create_prisme_chat(
    data: PrismeChatIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создание Prisme-чата с получателем: выбранный объект становится
    ЛИЧНЫМ КЛЮЧОМ создателя; получатель позже ставит свой отдельный ключ."""
    scene = _ensure_scene(session)
    obj = session.get(PrismeObject, data.object_id)
    if not obj or obj.scene_id != scene.id:
        raise HTTPException(404, "Объект не найден")
    if obj.status == "occupied":
        raise HTTPException(409, "Этот объект уже занят")

    other = session.get(User, data.other_user_id)
    if not other:
        raise HTTPException(404, "Получатель не найден")
    if other.id == user.id:
        raise HTTPException(400, "Нельзя создать Prisme-чат с собой")

    # Дедуп по паре: prisme-чат с этим пользователем уже существует?
    my_links = session.exec(select(ChatMember).where(ChatMember.user_id == user.id)).all()
    for link in my_links:
        ex = session.get(Chat, link.chat_id)
        if not ex or not getattr(ex, "is_prism", False):
            continue
        paired = session.exec(select(ChatMember).where(
            ChatMember.chat_id == link.chat_id,
            ChatMember.user_id == data.other_user_id,
        )).first()
        if paired:
            return {"ok": True, "already_existed": True, "chat_id": link.chat_id}

    # Атомарно занимаем объект (защита от гонки)
    from sqlalchemy import update
    res = session.exec(
        update(PrismeObject)
        .where(PrismeObject.id == obj.id, PrismeObject.status == "free")
        .values(status="occupied", owner_id=user.id, occupied_at=utcnow())
    )
    if res.rowcount == 0:
        session.rollback()
        raise HTTPException(409, "Этот объект уже занят")

    chat = Chat(is_prism=True, owner_id=user.id,
                name=f"PRISME #{obj.slot}·{other.username}")
    session.add(chat)
    session.commit()
    session.refresh(chat)

    # Оба участника сразу в чате — это настоящий диалог на двоих
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="owner"))
    session.add(ChatMember(chat_id=chat.id, user_id=other.id, role="member"))
    session.add(Message(
        chat_id=chat.id, sender_id=user.id, media_type="system",
        text=f"__PRISME_GENESIS__:{obj.slot}:{obj.kind}",
    ))
    obj.chat_id = chat.id
    session.add(obj)
    _bump(session, scene.id, "chats_created")
    # Получатель должен поставить СВОЙ объект-ключ
    session.add(Notification(user_id=other.id, actor_id=user.id, type="prisme_invited"))
    log_action(session, user.id, "prisme_chat_created", target_type="chat",
               target_id=chat.id, details={"slot": obj.slot, "with": other.username})
    session.commit()

    return {"ok": True, "already_existed": False, "chat_id": chat.id,
            "slot": obj.slot, "key": str(obj.slot), "kind": obj.kind,
            "other": {"id": other.id, "username": other.username,
                      "display_name": other.display_name}}


@router.post("/prisme/key")
def set_prisme_key(
    data: PrismeKeyIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Получатель ставит СВОЙ личный объект-ключ для приглашённого чата.
    У каждого участника — свой собственный объект на общей картинке."""
    scene = _ensure_scene(session)
    chat = session.get(Chat, data.chat_id)
    if not chat or not getattr(chat, "is_prism", False):
        raise HTTPException(404, "Prisme-чат не найден")

    membership = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat.id, ChatMember.user_id == user.id
    )).first()
    if not membership:
        raise HTTPException(403, "Вы не участник этого чата")

    already = session.exec(select(PrismeObject).where(
        PrismeObject.owner_id == user.id,
        PrismeObject.chat_id == chat.id,
        PrismeObject.scene_id == scene.id,
    )).first()
    if already:
        return {"ok": True, "already_set": True, "chat_id": chat.id,
                "slot": already.slot, "key": str(already.slot), "kind": already.kind}

    obj = session.get(PrismeObject, data.object_id)
    if not obj or obj.scene_id != scene.id:
        raise HTTPException(404, "Объект не найден")
    if obj.status != "free":
        raise HTTPException(409, "Этот объект уже занят")

    from sqlalchemy import update
    res = session.exec(
        update(PrismeObject)
        .where(PrismeObject.id == obj.id, PrismeObject.status == "free")
        .values(status="occupied", owner_id=user.id, occupied_at=utcnow(),
                chat_id=chat.id)
    )
    if res.rowcount == 0:
        session.rollback()
        raise HTTPException(409, "Этот объект уже занят")

    _bump(session, scene.id, "keys_total")
    log_action(session, user.id, "prisme_key_set", target_type="chat",
               target_id=chat.id, details={"slot": obj.slot})
    # Сообщаем партнёру, что второй ключ установлен
    partner_id = chat.owner_id if chat.owner_id and chat.owner_id != user.id else None
    if not partner_id:
        om = session.exec(select(ChatMember).where(
            ChatMember.chat_id == chat.id, ChatMember.user_id != user.id
        )).first()
        partner_id = om.user_id if om else None
    if partner_id:
        session.add(Notification(user_id=partner_id, actor_id=user.id,
                                 type="prisme_key_set"))
    session.commit()

    return {"ok": True, "already_set": False, "chat_id": chat.id,
            "slot": obj.slot, "key": str(obj.slot), "kind": obj.kind}


@router.post("/prisme/request")
def create_prisme_request(
    data: PrismeRequestIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Заявка в очередь ожидания, когда все объекты заняты."""
    scene = _ensure_scene(session)
    pending = session.exec(select(PrismeRequest).where(
        PrismeRequest.scene_id == scene.id,
        PrismeRequest.user_id == user.id,
        PrismeRequest.status == "pending",
    )).first()
    if pending:
        return {"ok": True, "already_existed": True, "request_id": pending.id}

    req = PrismeRequest(scene_id=scene.id, user_id=user.id,
                        message=(data.message or "").strip()[:500] or None)
    session.add(req)
    session.commit()
    session.refresh(req)

    _bump(session, scene.id, "requests_total")
    log_action(session, user.id, "prisme_request_created", target_type="prisme_request",
               target_id=req.id, details={"slot_count": scene.object_count})

    # Уведомляем всех админов
    admins = session.exec(select(User).where(User.is_admin == True)).all()  # noqa: E712
    for a in admins:
        if a.id == user.id:
            continue
        session.add(Notification(user_id=a.id, actor_id=user.id, type="prisme_request"))
    session.commit()

    return {"ok": True, "already_existed": False, "request_id": req.id}
@router.get("/prisme/stats")
def prisme_stats(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Статистика в ретро-дисплее. Полная — только для админа."""
    scene = _ensure_scene(session)
    is_admin = bool(getattr(user, "is_admin", False))
    objs = _all_objects(session, scene)
    free_n = sum(1 for o in objs if o.status == "free")
    pending = len(session.exec(select(PrismeRequest).where(
        PrismeRequest.scene_id == scene.id, PrismeRequest.status == "pending"
    )).all())
    stats = {
        "chats_created": _get_stat(session, scene.id, "chats_created").value,
        "requests_total": _get_stat(session, scene.id, "requests_total").value,
        "keys_total": _get_stat(session, scene.id, "keys_total").value,
        "object_count": len(objs),
        "base_count": scene.base_count,
        "free_count": free_n,
        "occupied_count": len(objs) - free_n,
        "expansion_level": scene.expansion_level,
        "pending_requests": pending,
    }
    if is_admin:
        # по уровням расширения — сколько объектов добавлено на каждом шаге
        by_exp = {}
        for o in objs:
            by_exp[o.added_at] = by_exp.get(o.added_at, 0) + 1
        stats["objects_by_expansion"] = dict(sorted(by_exp.items()))
    return stats


@router.get("/prisme/requests")
def prisme_requests(
    admin: User = Depends(_admin_required),
    session: Session = Depends(get_session),
):
    """Очередь ожидания заявок (только админ)."""
    scene = _ensure_scene(session)
    reqs = session.exec(select(PrismeRequest).where(
        PrismeRequest.scene_id == scene.id
    ).order_by(PrismeRequest.created_at)).all()
    ids = [r.user_id for r in reqs]
    users = {}
    if ids:
        us = session.exec(select(User).where(User.id.in_(ids))).all()
        users = {u.id: u for u in us}
    return [{
        "id": r.id,
        "user_id": r.user_id,
        "username": users.get(r.user_id).username if users.get(r.user_id) else None,
        "display_name": users.get(r.user_id).display_name if users.get(r.user_id) else None,
        "avatar_url": users.get(r.user_id).avatar_url if users.get(r.user_id) else None,
        "message": r.message,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
    } for r in reqs]


@router.post("/prisme/expand")
def prisme_expand(
    data: PrismeExpandIn,
    admin: User = Depends(_admin_required),
    session: Session = Depends(get_session),
):
    """Расширение картинки новыми объектами, чтобы освободить слоты."""
    if data.count < 1:
        raise HTTPException(400, "count должен быть >= 1")
    if data.count > 60:
        raise HTTPException(400, "Максимум 60 объектов за раз")
    scene = _ensure_scene(session)
    scene.object_count += data.count
    scene.expansion_level += 1
    scene.updated_at = utcnow()
    session.add(scene)
    session.commit()
    _sync_objects(session, scene)
    log_action(session, admin.id, "prisme_expand", target_type="prisme_scene",
               target_id=scene.id, details={"count": data.count})
    return {**(_scene_payload(session, scene, admin)), "expanded_by": data.count}


@router.post("/prisme/requests/{req_id}/resolve")
def prisme_resolve(
    req_id: int,
    data: PrismeResolveIn,
    admin: User = Depends(_admin_required),
    session: Session = Depends(get_session),
):
    """Отметить заявку как выполненную (grant) или отклонить (dismiss)."""
    req = session.get(PrismeRequest, req_id)
    if not req:
        raise HTTPException(404, "Заявка не найдена")
    if data.action not in ("grant", "dismiss"):
        raise HTTPException(400, "Допустимы значения: grant | dismiss")
    req.status = "granted" if data.action == "grant" else "dismissed"
    req.resolved_at = utcnow()
    req.resolved_by = admin.id
    session.add(req)
    # Уведомляем автора заявки
    if data.action == "grant":
        note_type = "prisme_granted"
    else:
        note_type = "prisme_dismissed"
    session.add(Notification(user_id=req.user_id, actor_id=admin.id, type=note_type))
    log_action(session, admin.id, "prisme_request_" + req.status, target_type="prisme_request",
               target_id=req.id)
    session.commit()
    return {"ok": True, "request_id": req.id, "status": req.status}
@router.get("/prisme/objects")
def prisme_all_objects(
    admin: User = Depends(_admin_required),
    session: Session = Depends(get_session),
):
    """Все объекты картинки со статусами и владельцами (только админ)."""
    scene = _ensure_scene(session)
    objs = _all_objects(session, scene)
    owner_ids = [o.owner_id for o in objs if o.owner_id]
    users = {}
    if owner_ids:
        us = session.exec(select(User).where(User.id.in_(owner_ids))).all()
        users = {u.id: u for u in us}
    chats = {c.id: c for c in session.exec(select(Chat).where(
        Chat.id.in_([o.chat_id for o in objs if o.chat_id])
    )).all()} if any(o.chat_id for o in objs) else {}
    return [{
        **_object_out(o),
        "owner_username": users[o.owner_id].username if o.owner_id in users else None,
        "owner_display_name": users[o.owner_id].display_name if o.owner_id in users else None,
        "chat_name": chats[o.chat_id].name if o.chat_id in chats else None,
    } for o in objs]