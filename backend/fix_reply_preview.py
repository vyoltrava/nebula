# fix_reply_preview.py
import os

# 1. Проверяем, есть ли функция в dependencies.py
dep_file = "dependencies.py"
chats_file = "routers/chats.py"

# Функция get_reply_preview из оригинального кода
func_code = """

def get_reply_preview(session: Session, reply_to_id: int):
    \"\"\"Возвращает краткое превью сообщения, на которое отвечают\"\"\"
    if not reply_to_id:
        return None
    original = session.get(Message, reply_to_id)
    if not original:
        return None
    sender = session.get(User, original.sender_id)
    # Обрезаем текст для превью
    preview_text = original.text or ""
    if original.media_type and not original.text:
        media_labels = {
            "image": "📷 Фото",
            "video": "🎬 Видео",
            "audio": "🎙️ Голосовое",
            "video_note": " Видеокружок",
            "gif": "🎞️ GIF",
        }
        preview_text = media_labels.get(original.media_type, " Вложение")
    return {
        "id": original.id,
        "sender_name": sender.display_name if sender else "Unknown",
        "sender_id": original.sender_id,
        "text": preview_text[:120],
        "media_type": original.media_type,
    }
"""

# 2. Если нет в dependencies.py - добавляем
if os.path.exists(dep_file):
    with open(dep_file, "r", encoding="utf-8") as f:
        dep_content = f.read()
    
    if "def get_reply_preview" not in dep_content:
        with open(dep_file, "a", encoding="utf-8") as f:
            f.write(func_code)
        print("✅ Функция get_reply_preview добавлена в dependencies.py")
    else:
        print("✅ Функция уже есть в dependencies.py")

# 3. Добавляем импорт в chats.py
if os.path.exists(chats_file):
    with open(chats_file, "r", encoding="utf-8") as f:
        chats_content = f.read()
    
    if "get_reply_preview" not in chats_content:
        # Находим строку с импортом из dependencies и добавляем
        if "from dependencies import" in chats_content:
            chats_content = chats_content.replace(
                "from dependencies import",
                "from dependencies import get_reply_preview,",
                1
            )
        else:
            chats_content = "from dependencies import get_reply_preview\n" + chats_content
        
        with open(chats_file, "w", encoding="utf-8") as f:
            f.write(chats_content)
        print("✅ Импорт get_reply_preview добавлен в chats.py")
    else:
        print("✅ Импорт уже есть в chats.py")

print("\n🚀 Готово! Пушь изменения.")