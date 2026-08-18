"""
Генератор нагрузки и фейковых данных.
Безопасен для продакшена: использует префикс 'lt_' для изоляции тестовых данных.

Запуск:
  python generate_load.py --generate   # Сгенерировать данные
  python generate_load.py --cleanup    # Удалить ТОЛЬКО сгенерированные данные
"""

import argparse
import json
import random
import string
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from faker import Faker
from passlib.context import CryptContext
from sqlalchemy import create_engine, func, delete, select, and_, or_
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, Session, select # <-- добавь select

# Импортируем ваши модели
from models import (
    User, Role, RoleCategory, Theme, Post, Like, Follow, Tag, PostTag,
    Chat, ChatMember, Message, MessageReaction, Notification, Bookmark,
    Report, Warning, ActionLog, IPLog, StickerPack, Sticker, PostView,
    LastReadPost, SupportTicket, SupportMessage, Update, UpdateRead, BugReport
)

fake = Faker(['ru_RU', 'en_US'])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ==================== КОНФИГУРАЦИЯ ====================
DB_URL = "postgresql://neondb_owner:npg_GixmS0Id7QgF@ep-cold-mouse-as91jt3o-pooler.c-4.eu-central-1.aws.neon.tech/nebula?sslmode=require&channel_binding=require" # ЗАМЕНИТЕ НА СВОЙ URL из .env
STATS_FILE = "load_test_stats.json"
FAKE_PREFIX = "lt_"  # Префикс для изоляции тестовых данных

class Config:
    USERS = 1000
    POSTS_PER_USER = (2, 10)
    LIKES_PER_POST = (0, 30)
    FOLLOWS_PER_USER = (5, 20)
    CHATS = 300
    MESSAGES_PER_CHAT = (10, 100)
    TAGS = 100
    BATCH_SIZE = 1000  # Размер пачки для вставки в БД

# ==================== УТИЛИТЫ ====================
def get_engine():
    """
    Умное подключение к БД.
    Автоматически определяет тип БД по URL и подставляет нужный драйвер.
    """
    url = DB_URL
    
    # Если URL начинается с https/http (ошибка из .env), пытаемся извлечь реальный URL
    if url.startswith("https://") or url.startswith("http://"):
        print(f"⚠️  Обнаружен HTTP-URL: {url}")
        print("💡 Это похоже на ошибку парсинга .env. Проверьте формат DATABASE_URL.")
        print("   Правильный формат: postgresql://user:pass@host:5432/dbname")
        sys.exit(1)
    
    # Определяем тип БД и подставляем драйвер
    if "postgresql" in url or "postgres" in url:
        # Для PostgreSQL используем psycopg2 (синхронный, быстрее для bulk-операций)
        url = url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        url = url.replace("postgresql://", "postgresql+psycopg2://")
        url = url.replace("postgres://", "postgresql+psycopg2://")
    elif "sqlite" in url:
        # Для SQLite ничего не меняем
        pass
    elif "mysql" in url:
        url = url.replace("mysql+aiomysql://", "mysql+pymysql://")
        url = url.replace("mysql://", "mysql+pymysql://")
    else:
        print(f"❌ Неизвестный тип БД в URL: {url}")
        sys.exit(1)
    
    print(f"🔗 Подключаемся к БД: {url.split('@')[0]}@***")  # Скрываем пароль
    return create_engine(url, pool_pre_ping=True, echo=False)

def random_date(start_days=365):
    return datetime.now(timezone.utc) - timedelta(days=random.randint(0, start_days), hours=random.randint(0, 23))

def bulk_save(session, objects):
    """Батчевое сохранение для экономии памяти"""
    for i in range(0, len(objects), Config.BATCH_SIZE):
        session.bulk_save_objects(objects[i:i+Config.BATCH_SIZE])
        session.commit()

# ==================== ГЕНЕРАЦИЯ ====================
def generate_data(engine):
    start_time = time.time()
    stats = {"tables": {}, "meta": {}}
    
    with Session(engine) as session:
        print("🚀 Начинаем генерацию...\n")
        
        # 1. Роли и Темы (Базовые сущности)
        print("🎨 Создаем роли и темы...")
        if not session.exec(select(Role).where(Role.name.like(f'{FAKE_PREFIX}%'))).first():
            cat = RoleCategory(name=f"{FAKE_PREFIX}test_cat", color="#ff0000")
            session.add(cat)
            session.commit()
            
            roles = [
                Role(name=f"{FAKE_PREFIX}admin", color="#ff0000", level=99, category_id=cat.id, is_staff=True),
                Role(name=f"{FAKE_PREFIX}moderator", color="#00ff00", level=50, category_id=cat.id, is_staff=True),
                Role(name=f"{FAKE_PREFIX}premium", color="#ffd700", level=10, category_id=cat.id),
            ]
            session.add_all(roles)
            session.commit()
            stats["tables"]["Role"] = len(roles)
            stats["tables"]["RoleCategory"] = 1

        themes = [
            Theme(name=f"{FAKE_PREFIX}aurora", type="aurora", colors='["#8b5cf6","#6366f1"]', min_level=0),
            Theme(name=f"{FAKE_PREFIX}neon", type="neon", colors='["#00ff00","#000000"]', min_level=10),
        ]
        session.add_all(themes)
        session.commit()
        stats["tables"]["Theme"] = len(themes)

        # 2. Пользователи
        print(f"👤 Создаем {Config.USERS} пользователей...")
        users = []
        roles_ids = [r.id for r in session.exec(select(Role).where(Role.name.like(f'{FAKE_PREFIX}%'))).all()]
        
        for i in range(Config.USERS):
            uname = f"{FAKE_PREFIX}{fake.user_name()}{i}"
            users.append(User(
                username=uname[:30],
                display_name=fake.name(),
                password_hash="$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW", # Это готовый хеш для "password123"
                avatar_url=f"https://api.dicebear.com/7.x/avataaars/svg?seed={uname}",
                bio=fake.text(max_nb_chars=100) if random.random() > 0.5 else None,
                role_id=random.choice(roles_ids) if random.random() > 0.9 else None,
                is_banned=random.random() < 0.02,
                created_at=random_date(365),
                last_seen=random_date(30)
            ))
        bulk_save(session, users)
        stats["tables"]["User"] = Config.USERS
        print(f"   ✅ Юзеры созданы")

        # Получаем ID созданных юзеров для связей
        fake_user_ids = session.exec(select(User.id).where(User.username.like(f'{FAKE_PREFIX}%'))).all()

        # 3. Теги
        print(f"🏷️  Создаем {Config.TAGS} тегов...")
        tags = [Tag(name=f"{FAKE_PREFIX}{fake.word()}{i}") for i in range(Config.TAGS)]
        bulk_save(session, tags)
        stats["tables"]["Tag"] = Config.TAGS
        fake_tag_ids = session.exec(select(Tag.id).where(Tag.name.like(f'{FAKE_PREFIX}%'))).all()

        # 4. Посты
        print("📝 Создаем посты...")
        posts = []
        for uid in fake_user_ids:
            for _ in range(random.randint(*Config.POSTS_PER_USER)):
                posts.append(Post(
                    author_id=uid,
                    text=fake.text(max_nb_chars=300),
                    media_url=f"https://picsum.photos/800/600?random={random.randint(1,100000)}" if random.random() > 0.7 else None,
                    media_type="image" if random.random() > 0.5 else None,
                    created_at=random_date(180),
                    views_count=random.randint(0, 5000)
                ))
        bulk_save(session, posts)
        stats["tables"]["Post"] = len(posts)
        print(f"   ✅ Постов: {len(posts)}")
        
        fake_post_ids = session.exec(select(Post.id).where(Post.author_id.in_(fake_user_ids))).all()

        # 5. Связи постов (Теги, Лайки, Закладки)
        print("🔗 Создаем связи (Теги, Лайки, Закладки)...")
        post_tags = [PostTag(post_id=random.choice(fake_post_ids), tag_id=random.choice(fake_tag_ids)) for _ in range(len(posts) * 2)]
        likes = [Like(user_id=random.choice(fake_user_ids), post_id=random.choice(fake_post_ids), created_at=random_date(90)) for _ in range(len(posts) * random.randint(*Config.LIKES_PER_POST) // 2)]
        bookmarks = [Bookmark(user_id=random.choice(fake_user_ids), post_id=random.choice(fake_post_ids)) for _ in range(len(posts) // 5)]
        
        # Уникальность для лайков и закладок (чтобы не было дублей и ошибок БД)
        likes = list({(l.user_id, l.post_id): l for l in likes}.values())
        bookmarks = list({(b.user_id, b.post_id): b for b in bookmarks}.values())
        post_tags = list({(pt.post_id, pt.tag_id): pt for pt in post_tags}.values())

        bulk_save(session, post_tags)
        bulk_save(session, likes)
        bulk_save(session, bookmarks)
        stats["tables"]["PostTag"] = len(post_tags)
        stats["tables"]["Like"] = len(likes)
        stats["tables"]["Bookmark"] = len(bookmarks)

        # 6. Подписки
        print("👥 Создаем подписки...")
        follows = []
        for uid in fake_user_ids:
            targets = random.sample([u for u in fake_user_ids if u != uid], min(random.randint(*Config.FOLLOWS_PER_USER), len(fake_user_ids)-1))
            follows.extend([Follow(follower_id=uid, followee_id=tid) for tid in targets])
        follows = list({(f.follower_id, f.followee_id): f for f in follows}.values())
        bulk_save(session, follows)
        stats["tables"]["Follow"] = len(follows)

        # 7. Чаты и Сообщения
        print(f"💬 Создаем {Config.CHATS} чатов и сообщения...")
        chats = []
        for i in range(Config.CHATS):
            is_group = random.random() > 0.5
            chats.append(Chat(
                is_group=is_group,
                name=fake.company() if is_group else None,
                owner_id=random.choice(fake_user_ids),
                created_at=random_date(90)
            ))
        bulk_save(session, chats)
        stats["tables"]["Chat"] = len(chats)
        
        fake_chat_ids = session.exec(select(Chat.id).where(Chat.owner_id.in_(fake_user_ids))).all()

        chat_members = []
        messages = []
        for cid in fake_chat_ids:
            members = random.sample(fake_user_ids, random.randint(2, 5))
            chat_members.extend([ChatMember(chat_id=cid, user_id=uid) for uid in members])
            
            for _ in range(random.randint(*Config.MESSAGES_PER_CHAT)):
                messages.append(Message(
                    chat_id=cid,
                    sender_id=random.choice(members),
                    text=fake.sentence(),
                    created_at=random_date(30)
                ))
        
        # Уникальность участников
        chat_members = list({(cm.chat_id, cm.user_id): cm for cm in chat_members}.values())
        bulk_save(session, chat_members)
        bulk_save(session, messages)
        stats["tables"]["ChatMember"] = len(chat_members)
        stats["tables"]["Message"] = len(messages)

        # 8. Уведомления и Репорты
        print("🔔 Создаем уведомления и репорты...")
        notifs = [Notification(user_id=random.choice(fake_user_ids), actor_id=random.choice(fake_user_ids), type=random.choice(["like", "follow", "mention"]), post_id=random.choice(fake_post_ids) if random.random() > 0.5 else None) for _ in range(Config.USERS * 2)]
        reports = [Report(reporter_id=random.choice(fake_user_ids), target_type="post", target_id=random.choice(fake_post_ids), reason="spam") for _ in range(50)]
        
        bulk_save(session, notifs)
        bulk_save(session, reports)
        stats["tables"]["Notification"] = len(notifs)
        stats["tables"]["Report"] = len(reports)

        # ==================== СТАТИСТИКА ====================
        elapsed = time.time() - start_time
        stats["meta"] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "execution_time_sec": round(elapsed, 2),
            "prefix_used": FAKE_PREFIX,
            "total_records": sum(stats["tables"].values())
        }
        
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
            
        print(f"\n✅ ГЕНЕРАЦИЯ ЗАВЕРШЕНА ЗА {elapsed:.2f} сек.")
        print(f"📊 Статистика сохранена в {STATS_FILE}")
        print(f"📦 Всего создано записей: {stats['meta']['total_records']}")


# ==================== БЕЗОПАСНАЯ ОЧИСТКА ====================
def cleanup_data(engine):
    print("🗑️  Начинаем безопасную очистку тестовых данных...\n")
    print(f"⚠️  Удаляем только записи, связанные с префиксом '{FAKE_PREFIX}'\n")
    
    with Session(engine) as session:
        # 1. Находим ID всех фейковых сущностей верхнего уровня
        fake_user_ids = [u[0] for u in session.query(User.id).filter(User.username.like(f'{FAKE_PREFIX}%')).all()]
        fake_tag_ids = [t[0] for t in session.query(Tag.id).filter(Tag.name.like(f'{FAKE_PREFIX}%')).all()]
        
        if not fake_user_ids:
            print("ℹ️  Тестовые данные не найдены. Нечего удалять.")
            return

        fake_post_ids = [p[0] for p in session.query(Post.id).filter(Post.author_id.in_(fake_user_ids)).all()]
        fake_chat_ids = [c[0] for c in session.query(Chat.id).filter(Chat.owner_id.in_(fake_user_ids)).all()]
        fake_role_ids = [r[0] for r in session.query(Role.id).filter(Role.name.like(f'{FAKE_PREFIX}%')).all()]

        print(f"Найдено: {len(fake_user_ids)} юзеров, {len(fake_post_ids)} постов, {len(fake_chat_ids)} чатов.")
        print("Удаляем зависимости (снизу вверх)...\n")

        # 2. Каскадное удаление (порядок важен из-за Foreign Keys!)
        deletes = [
            ("MessageReaction", delete(MessageReaction).where(MessageReaction.user_id.in_(fake_user_ids))),
            ("Message", delete(Message).where(or_(Message.sender_id.in_(fake_user_ids), Message.chat_id.in_(fake_chat_ids)))),
            ("ChatMember", delete(ChatMember).where(ChatMember.chat_id.in_(fake_chat_ids))),
            ("Chat", delete(Chat).where(Chat.id.in_(fake_chat_ids))),
            ("PostView", delete(PostView).where(PostView.post_id.in_(fake_post_ids))),
            ("LastReadPost", delete(LastReadPost).where(LastReadPost.post_id.in_(fake_post_ids))),
            ("PostTag", delete(PostTag).where(PostTag.post_id.in_(fake_post_ids))),
            ("Like", delete(Like).where(Like.post_id.in_(fake_post_ids))),
            ("Bookmark", delete(Bookmark).where(Bookmark.post_id.in_(fake_post_ids))),
            ("Post", delete(Post).where(or_(Post.author_id.in_(fake_user_ids), Post.reply_to_id.in_(fake_post_ids), Post.repost_of_id.in_(fake_post_ids)))),
            ("Follow", delete(Follow).where(or_(Follow.follower_id.in_(fake_user_ids), Follow.followee_id.in_(fake_user_ids)))),
            ("Notification", delete(Notification).where(or_(Notification.user_id.in_(fake_user_ids), Notification.actor_id.in_(fake_user_ids)))),
            ("Report", delete(Report).where(Report.reporter_id.in_(fake_user_ids))),
            ("Warning", delete(Warning).where(or_(Warning.user_id.in_(fake_user_ids), Warning.issuer_id.in_(fake_user_ids)))),
            ("ActionLog", delete(ActionLog).where(ActionLog.actor_id.in_(fake_user_ids))),
            ("IPLog", delete(IPLog).where(IPLog.user_id.in_(fake_user_ids))),
            ("User", delete(User).where(User.id.in_(fake_user_ids))),
            ("Tag", delete(Tag).where(Tag.id.in_(fake_tag_ids))),
            ("Role", delete(Role).where(Role.id.in_(fake_role_ids))),
            ("RoleCategory", delete(RoleCategory).where(RoleCategory.name.like(f'{FAKE_PREFIX}%'))),
            ("Theme", delete(Theme).where(Theme.name.like(f'{FAKE_PREFIX}%'))),
        ]

        for table_name, stmt in deletes:
            result = session.execute(stmt)
            print(f"   🗑️  {table_name}: удалено {result.rowcount} записей")
        
        session.commit()
        print("\n✅ ОЧИСТКА ЗАВЕРШЕНА. Реальные данные не затронуты.")


# ==================== ТОЧКА ВХОДА ====================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load Test Data Generator")
    parser.add_argument("--generate", action="store_true", help="Сгенерировать фейковые данные")
    parser.add_argument("--cleanup", action="store_true", help="Удалить ТОЛЬКО сгенерированные данные")
    parser.add_argument("--users", type=int, default=Config.USERS, help="Кол-во юзеров (по умолчанию 1000)")
    
    args = parser.parse_args()
    Config.USERS = args.users
    
    engine = get_engine()

    if args.generate:
        generate_data(engine)
    elif args.cleanup:
        cleanup_data(engine)
    else:
        parser.print_help()