import requests
import random
import time
import io

# ⚙️ НАЛАШТУВАННЯ (Зміни URL на свій бекенд, якщо він не на localhost:8000)
API_URL = "https://nebula-qqm2.onrender.com"
DEFAULT_PASSWORD = "seed_password_123"

# 🇺🇦 УКРАЇНСЬКА АУДИТОРІЯ
ukrainian_personas = [
    {"first": "Оксана", "last": "Шевченко", "username": "oksana_dev"},
    {"first": "Тарас", "last": "Бойко", "username": "taras_codes"},
    {"first": "Соломія", "last": "Коваль", "username": "solomiya_art"},
    {"first": "Максим", "last": "Гончар", "username": "max_honchar"},
    {"first": "Юлія", "last": "Мельник", "username": "julia.m"},
]

ukrainian_posts = [
    "Нарешті релізнув новий апдейт для свого пет-проєкту. Тепер темна тема працює ідеально 🌙",
    "Кава і код — ідеальний початок ранку в Києві. Хто сьогодні теж на віддаленці?",
    "Читаю про нові фічі WebSockets. Думав, що розібрався, але виявилося, що є ще багато нюансів з reconnect логікою.",
    "Прогулянка на Подолі після довгого дня за монітором. Місто зараз неймовірне 🍂",
    "Хтось вже тестував новий макет для trelod? Орбітальне меню — це щось нове, треба звикати, але виглядає соковито.",
    "Зберігаю ідеї для дизайну в натхненні від мінімалізму. Менше шуму, більше суті.",
    "Щойно закінчила налаштовувати E2E шифрування для чатів. Відчуття, ніби ти архітектор власної фортеці 🔐",
    "Кажуть, що ідеального UI не буває. Але коли бачиш, як анімації працюють на 60 FPS — розумієш, що межа можлива.",
]

# 🇬🇧 АНГЛІЙСЬКА/ЄВРОПЕЙСЬКА АУДИТОРІЯ
english_personas = [
    {"first": "Liam", "last": "Smith", "username": "liam_smith"},
    {"first": "Emma", "last": "Davis", "username": "emma_d"},
    {"first": "Noah", "last": "Wilson", "username": "noah_w"},
    {"first": "Olivia", "last": "Brown", "username": "olivia_b"},
    {"first": "Lucas", "last": "Jones", "username": "lucas_j"},
]

english_posts = [
    "Just shipped a major update to my side project. The new UI feels so much cleaner now. 🚀",
    "Working from a cafe in Berlin today. The coffee here is unreal, but the Wi-Fi is a bit spotty. ☕💻",
    "Spent the weekend refactoring the WebSocket manager. Real-time sync is finally buttery smooth.",
    "Anyone else obsessed with the new layout options? The dock navigation is a game changer for focus.",
    "Listening to some lo-fi beats while designing the new sticker packs. Productivity is at 100%.",
    "Sunset in Lisbon hits different when you're debugging a tricky CSS grid issue. 🌅",
    "Finally got end-to-end encryption working for the secret chats. Privacy matters, even in small communities.",
    "Testing out the new Prism channels. The concept of splitting keys is genius. 🔮",
]

def get_random_avatar():
    """Завантажує реалістичне фото людини з randomuser.me"""
    try:
        resp = requests.get("https://randomuser.me/api/?nat=us,gb,de,fr,ua", timeout=5)
        data = resp.json()
        img_url = data["results"][0]["picture"]["large"]
        img_resp = requests.get(img_url, timeout=5)
        return img_resp.content
    except Exception as e:
        print(f"⚠️ Не вдалося завантажити аватарку: {e}")
        return None

def get_random_post_image():
    """Завантажує рандомну картинку для посту з picsum.photos"""
    try:
        url = f"https://picsum.photos/800/600?random={random.randint(1, 100000)}"
        img_resp = requests.get(url, timeout=5)
        return img_resp.content
    except:
        return None

def register_user(username, display_name):
    """Реєстрація користувача"""
    payload = {
        "username": username,
        "display_name": display_name,
        "password": DEFAULT_PASSWORD
    }
    r = requests.post(f"{API_URL}/api/register", json=payload)
    if r.status_code == 200:
        return r.json()["token"]
    else:
        print(f"❌ Помилка реєстрації {username}: {r.text}")
        return None

def upload_avatar(token, img_bytes):
    """Завантаження аватарки"""
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": ("avatar.jpg", img_bytes, "image/jpeg")}
    r = requests.post(f"{API_URL}/api/me/avatar", headers=headers, files=files)
    return r.status_code == 200

def create_post(token, text, img_bytes=None):
    """Створення посту (з картинкою або без)"""
    headers = {"Authorization": f"Bearer {token}"}
    data = {"text": text}
    files = {}
    
    if img_bytes:
        files["file"] = ("post.jpg", img_bytes, "image/jpeg")
        
    r = requests.post(f"{API_URL}/api/posts", headers=headers, data=data, files=files)
    return r.status_code == 200

def main():
    print("🚀 Починаємо заселення мережі trelod...\n")
    
    # Об'єднуємо персонажів з їхніми мовами та постами
    all_users = [
        {"lang": "uk", "data": p, "posts_pool": ukrainian_posts} for p in ukrainian_personas
    ] + [
        {"lang": "en", "data": p, "posts_pool": english_posts} for p in english_personas
    ]
    
    random.shuffle(all_users) # Перемішуємо порядок реєстрації
    
    for user_info in all_users:
        p = user_info["data"]
        display_name = f"{p['first']} {p['last']}"
        
        print(f"👤 Створюємо {display_name} (@{p['username']})...")
        
        # 1. Реєстрація
        token = register_user(p["username"], display_name)
        if not token:
            continue
            
        # 2. Аватарка
        avatar_bytes = get_random_avatar()
        if avatar_bytes:
            if upload_avatar(token, avatar_bytes):
                print("  ✅ Аватарку завантажено")
            else:
                print("  ⚠️ Не вдалося завантажити аватарку на сервер")
        
        time.sleep(random.uniform(0.5, 1.2)) # Невелика пауза, щоб не спамити
        
        # 3. Пости (кожен юзер пише від 2 до 4 постів)
        posts_to_write = random.sample(user_info["posts_pool"], random.randint(2, 4))
        
        for post_text in posts_to_write:
            # 40% шанс, що пост буде з картинкою
            img_bytes = get_random_post_image() if random.random() < 0.4 else None
            
            if create_post(token, post_text, img_bytes):
                has_img = "🖼️" if img_bytes else "📝"
                print(f"  {has_img} Опубліковано: {post_text[:40]}...")
            else:
                print(f"  ❌ Помилка публікації")
                
            time.sleep(random.uniform(0.8, 1.5)) # Пауза між постами (захист від rate limit)
            
        print("-" * 40)
        
    print("\n🎉 Готово! Мережа ожила. Можна записувати відео.")

if __name__ == "__main__":
    main()