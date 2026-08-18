# fix_syntax.py
import os

filepath = "routers/posts.py"
if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Чиним сломанный импорт
    content = content.replace("from models import PostView,  *", "from models import *")
    content = content.replace("from models import PostView, *", "from models import *")
    content = content.replace("from models import *, PostView", "from models import *")
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Синтаксис в routers/posts.py исправлен!")
else:
    print("⚠️ Файл не найден")