"""
Математический движок системы рекомендаций Nebula.
Оценивает пару (anchor_user, candidate) по 8 метрикам с фиксированными весами.
Все функции принимают `session: Session` и работают с теми же ядром моделей,
что и основной main.py (Follow, Post, PostTag, Tag, Like, Role, IPLog).
Результаты кешируются в Redis на 24 часа.
"""
import math
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlmodel import Session, select, func
from models import User, Post, PostTag, Tag, Follow, Like, Role

# Веса метрик (см. ТЗ). Сумма = 1.0
WEIGHTS = {
    "subscriptions": 0.25,
    "audience":      0.20,
    "interests":     0.18,
    "activity":      0.12,
    "engagement":    0.10,
    "language":      0.08,
    "roles":         0.05,
    "time":          0.02,
}

# Цвета для UI-карточек (фикс в спецификации)
METRIC_COLORS = {
    "subscriptions": "#4CAF50", "audience": "#2196F3", "interests": "#FF9800",
    "activity": "#9C27B0", "engagement": "#F44336", "language": "#00BCD4",
    "roles": "#795548", "time": "#607D8B",
}


# ---------------------------------------------------------------
# вспомогательные «репозиторные» запросы
# ---------------------------------------------------------------
def _following_ids(user_id: int, session: Session) -> List[int]:
    rows = session.exec(select(Follow.followee_id).where(Follow.follower_id == user_id)).all()
    return [r[0] if isinstance(r, tuple) else r for r in rows] or []


def _follower_ids(user_id: int, session: Session) -> List[int]:
    rows = session.exec(select(Follow.follower_id).where(Follow.followee_id == user_id)).all()
    return [r[0] if isinstance(r, tuple) else r for r in rows] or []

"""
🌌 recommendations.py — движок схожести пользователей (граф «паутина»).
8 метрик с весами, итоговый score 0-100. Опирается на модели:
Follow, Post, Tag, PostTag, Like, User.
Кеширует результат в Redis (если передан redis_client) на 24 ч.
"""
import json
import math
from datetime import datetime, timezone
from collections import Counter
from typing import Optional, List, Dict, Any

from sqlmodel import Session, select, func

from models import Follow, Post, PostTag, Tag, User

# Веса метрик (см. ТЗ)
WEIGHTS = {
    "subscriptions": 0.25,
    "audience":      0.20,
    "interests":     0.18,
    "activity":      0.12,
    "engagement":    0.10,
    "language":      0.08,
    "roles":         0.05,
    "time":          0.02,
}

# Цвета для UI-карточек
METRIC_COLORS = {
    "subscriptions": "#4CAF50", "audience": "#2196F3", "interests": "#FF9800",
    "activity": "#9C27B0", "engagement": "#F44336", "language": "#00BCD4",
    "roles": "#795548", "time": "#607D8B",
}


# ---------------------------------------------------------------
# вспомогательные «репозиторные» запросы
# ---------------------------------------------------------------
def _following_ids(db: Session, user_id: int) -> list[int]:
    return [r.following_id for r in db.exec(select(Follow).where(Follow.follower_id == user_id)).all()]


def _follower_ids(db: Session, user_id: int) -> list[int]:
    return [r.follower_id for r in db.exec(select(Follow).where(Follow.following_id == user_id)).all()]


def _user_posts_30d(db: Session, user_id: int) -> list[Post]:
    cutoff = datetime.utcnow().replace(tzinfo=None)
    # Post.created_at может быть naive — вычитаем 30 дней в Python для переносимости между SQLite/PostgreSQL
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(days=30)
    stmt = (
        select(Post)
        .where(
            Post.author_id == user_id,
            Post.reply_to_id.is_(None),
            Post.repost_of_id.is_(None),
        )
        .order_by(Post.created_at.desc())
        .limit(200)
    )
    return list(db.exec(stmt).all())



def _user_post_count(db: Session, user_id: int) -> int:
    return db.exec(select(func.count()).where(Post.author_id == user_id)).one()


def _post_tag_overlap(db: Session, user_id: int) -> set[int]:
    stmt = select(PostTag.tag_id).join(Post, Post.id == PostTag.post_id).where(Post.author_id == user_id)
    return set(db.exec(stmt).all())


def _follower_overlap(db: Session, a: int, b: int) -> set[int]:
    fa = set(_follower_ids(db, a))
    fb = set(_follower_ids(db, b))
    return fa & fb


def calculate_subscription_similarity(db: Session, a: User, b: User) -> float:
    """1. Пересечение подписок — 25%"""
    fa = set(_following_ids(db, a.id))
    fb = set(_following_ids(db, b.id))
    if not fa or not fb:
        return 0.0
    base = len(fa & fb) / max(len(fa), len(fb)) * 100.0
    premium = 0.0
    for uid in fa & fb:
        pc = _user_post_count(db, uid)
        if pc > 1000:
            premium += 2.0
    return min(base + min(premium, 10.0), 100.0)


def calculate_audience_similarity(db: Session, a: User, b: User) -> float:
    """2. Пересечение аудитории — 20%"""
    fa = set(_follower_ids(db, a.id))
    fb = set(_follower_ids(db, b.id))
    if not fa or not fb:
        return 0.0
    inter = fa & fb
    base = len(inter) * 0.7 / max(len(fa), len(fb)) * 100.0
    active = sum(1 for fid in inter if len(_user_posts_30d(db, fid)) > 5)
    active_part = active * 0.3 / max(len(fa), len(fb)) * 100.0
    return min(base + active_part, 100.0)



def _rel(x: float, y: float) -> float:
    m = max(x, y)
    if m <= 0:
        return 0.0
    return max(0.0, 1.0 - abs(x - y) / m)


def _cosine(va: list[float], vb: list[float]) -> float:
    if not va or not vb:
        return 0.0
    dot = sum(x * y for x, y in zip(va, vb))
    na = math.sqrt(sum(x * x for x in va)) or 1.0
    nb = math.sqrt(sum(y * y for y in vb)) or 1.0
    return max(0.0, min(1.0, dot / (na * nb)))


def _posting_pattern(posts: list[Post]) -> list[float]:
    v = [0.0] * 24
    for p in posts:
        dt = p.created_at
        if dt:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            v[dt.hour % 24] += 1.0
        return v


def _post_tag_overlap(db: Session, user_id: int) -> set[int]:
    stmt = select(PostTag.tag_id).join(Post, PostTag.post_id == Post.id).where(Post.author_id == user_id)
    return set(db.exec(stmt).all())


def calculate_interest_similarity(db: Session, a: User, b: User) -> float:
    """3. Интересы (взвешенный Jaccard) — 18%"""
    ta = _post_tag_overlap(db, a.id)
    tb = _post_tag_overlap(db, b.id)
    if not ta or not tb:
        return 0.0
    common = ta & tb
    if not common:
        return 0.0
    w_sum = 0.0
    for t in common:
        ca = db.exec(select(func.count()).select(PostTag).where(
            PostTag.tag_id == t).join(Post, PostTag.post_id == Post.id).where(Post.author_id == a.id)).one()
        cb = db.exec(select(func.count()).select(PostTag).where(
            PostTag.tag_id == t).join(Post, PostTag.post_id == Post.id).where(Post.author_id == b.id)).one()
        if max(ca, cb) > 0:
            w_sum += min(ca, cb) / max(ca, cb)
        return w_sum / len(ta | tb) * 100.0


def calculate_activity_similarity(db: Session, a: User, b: User) -> float:
    """4. Активность — 12%"""
    pa = _user_posts_30d(db, a.id)
    pb = _user_posts_30d(db, b.id)
    posts_a = len(pa) / 30.0
    posts_b = len(pb) / 30.0
    freq = _rel(posts_a, posts_b)
    la = sum(len(p.text or "") for p in pa) / max(len(pa), 1)
    lb = sum(len(p.text or "") for p in pb) / max(len(pb), 1)
    length = _rel(la, lb)
    time = _cosine(_posting_pattern(pa), _posting_pattern(pb))
    def _media(posts: list[Post]) -> float:
        if not posts:
            return 0.0
        return sum(1 for p in posts if p.media_type) / len(posts) * 100.0
    ma, mb = _media(pa), _media(pb)
    media = 1 - abs(ma - mb) / 100.0 if max(ma, mb) > 0 else 0.0
    return (freq * 0.35 + length * 0.25 + time * 0.25 + media * 0.15) * 100.0


def _avg_likes_per_post(db: Session, uid: int) -> float:
    total = db.exec(select(func.count()).select(Like).where(
        Like.post_id.in_(db.exec(select(Post.id).where(Post.author_id == uid)))
    )).one() or 0
    pc = _user_post_count(db, uid)
    return float(total) / max(pc, 1)


def _avg_comments_per_post(db: Session, uid: int) -> float:
    reply_ids = [r.id for r in db.exec(select(Post.id).where(Post.author_id == uid))]
    if not reply_ids:
        return 0.0
    replies = db.exec(select(func.count()).where(Post.reply_to_id.in_(reply_ids))).one() or 0
    pc = _user_post_count(db, uid)
    return float(replies) / max(pc, 1)


def _retention(db: Session, u: User) -> float:
    created = u.created_at
    if created.tzinfo is not None:
        created = created.replace(tzinfo=None)
    days = (datetime.utcnow() - created).total_seconds() / 86400
    fcount = len(_follower_ids(db, u.id))
    return fcount / max(days, 1)


def calculate_engagement_similarity(db: Session, a: User, b: User) -> float:
    """5. Engagement — 10%"""
    likes = _rel(_avg_likes_per_post(db, a.id), _avg_likes_per_post(db, b.id))
    comments = _rel(_avg_comments_per_post(db, a.id), _avg_comments_per_post(db, b.id))
    ret = _rel(_retention(db, a), _retention(db, b))
    if not (0.0 <= ret <= 1.0):
        ret = 0.0
        return (likes * 0.4 + comments * 0.35 + ret * 0.25) * 100.0


def _detect_language(db: Session, uid: int) -> Optional[str]:
    texts = db.exec(select(Post.text).where(Post.author_id == uid).limit(50)).all()
    texts = [t for t in texts if t]
    if not texts:
        return None
    joined = " ".join(texts)
    cyr = sum(1 for ch in joined if 0x0400 <= ord(ch) <= 0x04FF)
    lat = sum(1 for ch in joined if 0x0041 <= ord(ch) <= 0x007A)
    if cyr > lat * 2:
        return "uk" if any(ord(ch) in (0x0456, 0x0457, 0x0454) for ch in joined) else "ru"
    return "en"


def _user_timezone(db: Session, u: User) -> Optional[str]:
    tz = getattr(u, "timezone", None)
    if tz:
        return tz
    from models import IPLog
    log = db.exec(select(IPLog).where(IPLog.user_id == u.id).order_by(IPLog.login_at.desc()).limit(1)).first()
    return getattr(log, "timezone", None) if log else None


def calculate_language_similarity(db: Session, a: User, b: User) -> float:
    """6. Язык + часовой пояс — 8%"""
    la = _detect_language(db, a.id)
    lb = _detect_language(db, b.id)
    lang_score = 100.0 if la and la == lb else 0.0
    tz_a = _user_timezone(db, a)
    tz_b = _user_timezone(db, b)
    tz_diff = 24
    if tz_a and tz_b:
        try:
            import zoneinfo
            off_a = datetime.now(zoneinfo.ZoneInfo(tz_a)).utcoffset().total_seconds() / 3600
            off_b = datetime.now(zoneinfo.ZoneInfo(tz_b)).utcoffset().total_seconds() / 3600
            tz_diff = abs(int(off_a - off_b))
        except Exception:
            tz_diff = 24
    if tz_a and tz_b:
        tz_score = 100.0 if tz_a == tz_b else (60.0 if tz_diff < 2 else 0.0)
    else:
        tz_score = 50.0
    return lang_score * 0.7 + tz_score * 0.3


def calculate_roles_similarity(db: Session, a: User, b: User) -> float:
    """7. Роли + бейджи — 5%"""
    from models import Role
    def _roles(u: User) -> set:
        s = set()
        if u.role_id:
            role = db.get(Role, u.role_id)
            if role:
                s.add(role.name)
        return s
    ra, rb = _roles(a), _roles(b)
    role_overlap = len(ra & rb) / len(ra | rb) if (ra or rb) else 0.0
    badge_overlap = 0.0
    if a.billet_url and b.billet_url:
        badge_overlap = 1.0 if a.billet_url == b.billet_url else 0.3
    return (role_overlap * 0.5 + badge_overlap * 0.5) * 100.0


def calculate_time_similarity(db: Session, a: User, b: User) -> float:
    """8. Время в системе — 2%"""
    def _days(u: User) -> float:
        created = u.created_at
        if created.tzinfo is not None:
            created = created.replace(tzinfo=None)
        return (datetime.utcnow() - created).total_seconds() / 86400
    reg = _rel(_days(a), _days(b))
    def _sess(u: User) -> float:
        from models import IPLog
        logs = db.exec(select(IPLog).where(IPLog.user_id == u.id).order_by(IPLog.login_at.desc()).limit(200)).all()
        diffs = []
        for lg in logs:
            logout = getattr(lg, "logout_at", None)
            if logout and lg.login_at:
                diffs.append((logout - lg.login_at).total_seconds())
        return sum(diffs) / len(diffs) if diffs else 0.0
        sess = _rel(_sess(a), _sess(b))
    return (reg * 0.4 + sess * 0.6) * 100.0


# ---------------------------------------------------------------
# Сводный расчёт + кеш в Redis
# ---------------------------------------------------------------
def calculate_overall_similarity(db: Session, a: User, b: User, redis_client=None, skip_cache: bool = False) -> Dict[str, Any]:
    key = f"sim:{a.id}:{b.id}"
    if redis_client and not skip_cache:
        cached = redis_client.get(key) or redis_client.get(f"sim:{b.id}:{a.id}")
        if cached:
            try:
                return json.loads(cached)
            except Exception:
                pass

    metrics = {
        "subscriptions": calculate_subscription_similarity(db, a, b),
        "audience":      calculate_audience_similarity(db, a, b),
        "interests":     calculate_interest_similarity(db, a, b),
        "activity":      calculate_activity_similarity(db, a, b),
        "engagement":    calculate_engagement_similarity(db, a, b),
        "language":      calculate_language_similarity(db, a, b),
        "roles":         calculate_roles_similarity(db, a, b),
        "time":          calculate_time_similarity(db, a, b),
    }
    overall = sum(metrics[k] * WEIGHTS[k] for k in WEIGHTS)

        # общие теги (до 5)
    common_tags = _post_tag_overlap(db, a.id) & _post_tag_overlap(db, b.id)
    common = [db.get(Tag, t).name for t in list(common_tags)[:5]] if common_tags else []

    inter = set(_follower_ids(db, a.id)) & set(_follower_ids(db, b.id))
    avs = [u.avatar_url for u in db.exec(select(User).where(User.id.in_(list(inter)[:8]))).all() if u.avatar_url]

    result = {
        "similarity_score": round(overall, 1),
        "metrics": {k: round(v, 1) for k, v in metrics.items()},
        "common_interests": common,
        "mutual_friends": len(inter),
        "mutual_friends_avatars": avs,
        "metric_colors": METRIC_COLORS,
    }
    if redis_client:
        try:
            redis_client.setex(key, 86400, json.dumps(result))
        except Exception:
            pass
    return result






