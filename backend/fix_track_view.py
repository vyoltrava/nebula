# fix_track_view.py
import os

dep_file = "dependencies.py"
posts_file = "routers/posts.py"

# Код функции с внутренними импортами, чтобы она работала автономно
func_code = """

def _track_view_sync(post_id: int, viewer_hash: str):
    \"\"\"Синхронная функция для обновления views (выполняется в фоне)\"\"\"
    from sqlmodel import Session, select
    from datetime import datetime, timezone, timedelta
    from models import PostView, Post
    from database import engine
    
    with Session(engine) as session:
        post = session.get(Post, post_id)
        if not post:
            return
        yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
        existing = session.exec(
            select(PostView).where(
                PostView.post_id == post_id,
                PostView.viewer_hash == viewer_hash,
                PostView.viewed_at > yesterday
            )
        ).first()
        if not existing:
            session.add(PostView(post_id=post_id, viewer_hash=viewer_hash))
            post.views_count = (post.views_count or 0) + 1
            session.add(post)
            session.commit()
"""

# 1. Добавляем функцию в dependencies.py
if os.path.exists(dep_file):
    with open(dep_file, "r", encoding="utf-8") as f:
        dep_content = f.read()
    
    if "def _track_view_sync" not in dep_content:
        with open(dep_file, "a", encoding="utf-8") as f:
            f.write(func_code)
        print("✅ Функция _track_view_sync добавлена в dependencies.py")
    else:
        print("✅ Функция _track_view_sync уже есть в dependencies.py")

# 2. Добавляем импорт в routers/posts.py
if os.path.exists(posts_file):
    with open(posts_file, "r", encoding="utf-8") as f:
        posts_content = f.read()
    
    # Проверяем, импортирована ли функция
    if "_track_view_sync" not in posts_content or "from dependencies import _track_view_sync" not in posts_content:
        if "from dependencies import" in posts_content:
            posts_content = posts_content.replace(
                "from dependencies import",
                "from dependencies import _track_view_sync, ",
                1
            )
        else:
            posts_content = "from dependencies import _track_view_sync\n" + posts_content
        
        with open(posts_file, "w", encoding="utf-8") as f:
            f.write(posts_content)
        print("✅ Импорт _track_view_sync добавлен в routers/posts.py")
    else:
        print("✅ Импорт _track_view_sync уже есть в routers/posts.py")

print("\n🚀 ГОТОВО! Теперь выполни в терминале:")
print("git add .")
print("git commit -m 'Fix: add _track_view_sync to dependencies and posts router'")
print("git push origin main")