"""
Удаляет всех ботов массового бота по префиксу 'ab_' в username.
Запуск: python cleanup_mass_bot.py
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlmodel import Session
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")
if not DB_URL:
    print("❌ DATABASE_URL не найден в .env")
    sys.exit(1)

if "postgresql+asyncpg" in DB_URL:
    DB_URL = DB_URL.replace("postgresql+asyncpg", "postgresql+psycopg2")
elif "postgresql" in DB_URL and "psycopg2" not in DB_URL:
    DB_URL = DB_URL.replace("postgresql://", "postgresql+psycopg2://")

BOT_PREFIX = "ab_"
engine = create_engine(DB_URL)

with Session(engine) as session:
    print(f"🗑️  Удаляем всех ботов с префиксом '{BOT_PREFIX}'...")
    
    bot_ids = session.exec(text(f"SELECT id FROM \"user\" WHERE username LIKE '{BOT_PREFIX}%'")).all()
    
    if not bot_ids:
        print("ℹ️  Боты не найдены.")
        sys.exit(0)
    
    bot_ids = [b[0] if isinstance(b, tuple) else b for b in bot_ids]
    print(f"Найдено ботов: {len(bot_ids)}")
    
    deletes = [
        ("MessageReaction", f"DELETE FROM message_reaction WHERE user_id IN ({','.join(map(str, bot_ids))})"),
        ("Message", f"DELETE FROM message WHERE sender_id IN ({','.join(map(str, bot_ids))})"),
        ("ChatMember", f"DELETE FROM chatmember WHERE user_id IN ({','.join(map(str, bot_ids))})"),
        ("PostView", f"DELETE FROM postview WHERE viewer_hash IN (SELECT 'u' || id FROM \"user\" WHERE id IN ({','.join(map(str, bot_ids))}))"),
        ("LastReadPost", f"DELETE FROM lastreadpost WHERE user_id IN ({','.join(map(str, bot_ids))})"),
        ("PostTag", f"DELETE FROM posttag WHERE post_id IN (SELECT id FROM post WHERE author_id IN ({','.join(map(str, bot_ids))}))"),
        ("Like", f"DELETE FROM \"like\" WHERE user_id IN ({','.join(map(str, bot_ids))})"),
        ("Bookmark", f"DELETE FROM bookmark WHERE user_id IN ({','.join(map(str, bot_ids))})"),
        ("Post", f"DELETE FROM post WHERE author_id IN ({','.join(map(str, bot_ids))})"),
        ("Follow", f"DELETE FROM follow WHERE follower_id IN ({','.join(map(str, bot_ids))}) OR followee_id IN ({','.join(map(str, bot_ids))})"),
        ("Notification", f"DELETE FROM notification WHERE user_id IN ({','.join(map(str, bot_ids))}) OR actor_id IN ({','.join(map(str, bot_ids))})"),
        ("User", f"DELETE FROM \"user\" WHERE id IN ({','.join(map(str, bot_ids))})"),
    ]
    
    for table_name, sql in deletes:
        result = session.exec(text(sql))
        count = result.rowcount if hasattr(result, 'rowcount') else 'N/A'
        print(f"   🗑️  {table_name}: удалено {count}")
    
    session.commit()
    print(f"\n✅ Все боты ({len(bot_ids)}) и их активность удалены!")