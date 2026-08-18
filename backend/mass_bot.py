"""
Массовый бот активности: 1000-2000 реалистичных пользователей.
Запуск: python mass_bot.py --bots 1500 --hours 24
"""

import asyncio
import random
import time
import httpx
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict
import os
from faker import Faker

# ==================== КОНФИГУРАЦИЯ ====================
API_URL = os.getenv("API_URL", "https://nebula-qqm2.onrender.com")
BOT_PREFIX = "ab_"
BOT_PASSWORD = "mass_bot_2024_secure"
NUM_BOTS = 1500
MIN_DELAY_BOT = 30
MAX_DELAY_BOT = 600
BATCH_SIZE = 5  # Маленький батч, чтобы Render не банит

MORNING_PEOPLE = list(range(6, 12))
DAY_WORKERS = list(range(9, 18))
EVENING_PEOPLE = list(range(18, 24))
NIGHT_OWLS = list(range(22, 24)) + list(range(0, 6))

fake = Faker(['ru_RU', 'en_US'])

QUOTES = [
    "Жизнь — это то, что с тобой происходит, пока ты строишь другие планы.",
    "Единственный способ делать великие дела — любить то, что ты делаешь.",
    "Будь собой; прочие роли уже заняты.",
    "Успех — это идти от неудачи к неудаче, не теряя энтузиазма.",
    "Лучшее время посадить дерево было 20 лет назад. Второе лучшее время — сегодня.",
    "Не бойся идти медленно, бойся стоять на месте.",
    "Каждый день — это новый шанс изменить свою жизнь.",
    "Счастье — это не пункт назначения, а способ путешествия.",
    "Делай что можешь, с тем что имеешь, там где ты есть.",
    "Будущее принадлежит тем, кто верит в красоту своих мечтаний."
]

CASUAL_POSTS = [
    "Кто-нибудь еще не спит? 🌙",
    "Утро начинается не с кофе, а с кода ☕💻",
    "Пятница! Наконец-то можно выдохнуть 🎉",
    "Только что закончил проект. Чувство невероятное!",
    "Ищу интересные проекты для совместной работы. Кто со мной?",
    "Вдохновился сегодня одной статьей. Будущее уже здесь!",
    "Кто знает хорошие ресурсы для изучения? Поделитесь ссылками",
    "Работаю над новой фичей. Надеюсь, скоро покажу результат 🚀",
    "Только что проснулся. Какой план на день?",
    "Залип на сериале. Три часа пролетели как одна минута 😅"
]

TECH_POSTS = [
    "Только что развернул Docker контейнер за 30 секунд. Магия!",
    "Кто-нибудь использует Rust в продакшене? Поделитесь опытом.",
    "React vs Vue vs Angular. Вечный спор 😄",
    "Только что узнал про новую фичу в Python 3.12. Круто!",
    "Кто знает, как оптимизировать SQL запросы? Помогите!",
    "Git rebase или merge? Что предпочитаете?",
    "Только что написал свой первый тест. Чувство удовлетворения!",
    "Кто-нибудь работает с Kubernetes? Сложно?",
    "Нашел баг в коде. Искал 3 часа. Оказалось, опечатка 😂",
    "TypeScript — это любовь или ненависть?"
]

MEMES = [
    "Программист — это человек, который решает проблему, о которой ты не знал, способом, который ты не понимаешь.",
    "99 багов в коде, 99 багов в коде. Берешь один и чинишь его... 127 багов в коде.",
    "Почему программисты путают Хэллоуин и Рождество? Потому что Oct 31 == Dec 25.",
    "Есть 10 типов людей: те, кто понимают двоичную систему, и те, кто не понимают.",
    "Лучший код — это код, который не нужно писать.",
    "Когда код работает с первого раза, но ты не понимаешь почему 😅",
    "Дедлайн — это не дата, это состояние души."
]

QUESTIONS = [
    "Какой ваш любимый язык программирования и почему?",
    "Что вы думаете о будущем AI?",
    "Какой совет вы бы дали себе 5 лет назад?",
    "Какая книга изменила ваше мышление?",
    "Что вас мотивирует работать над проектами?",
    "Как вы справляетесь с выгоранием?",
    "Какой ваш любимый инструмент для разработки?"
]

TAGS = ["python", "javascript", "webdev", "programming", "tech", "coding", "developer", 
        "opensource", "ai", "machinelearning", "startup", "design", "ux", "ui", 
        "frontend", "backend", "fullstack", "devops", "cloud", "docker", "kubernetes"]

PERSONALITY_TYPES = [
    {"type": "developer", "weight": 0.3, "styles": ["tech", "quotes", "questions"]},
    {"type": "designer", "weight": 0.15, "styles": ["casual", "quotes"]},
    {"type": "student", "weight": 0.2, "styles": ["questions", "casual", "tech"]},
    {"type": "entrepreneur", "weight": 0.1, "styles": ["quotes", "questions", "casual"]},
    {"type": "freelancer", "weight": 0.1, "styles": ["casual", "tech", "questions"]},
    {"type": "hobbyist", "weight": 0.15, "styles": ["memes", "casual", "questions"]},
]

ACTIVITY_LEVELS = {
    "high": {"posts_per_day": (3, 8), "likes_per_day": (20, 50)},
    "medium": {"posts_per_day": (1, 3), "likes_per_day": (10, 20)},
    "low": {"posts_per_day": (0, 1), "likes_per_day": (5, 10)},
}

SCHEDULE_TYPES = {
    "morning": MORNING_PEOPLE,
    "day": DAY_WORKERS,
    "evening": EVENING_PEOPLE,
    "night": NIGHT_OWLS,
}

# ============================================================

class MassBot:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        self.personality = self._generate_personality()
        self.username = f"{BOT_PREFIX}user_{bot_id:04d}"
        self.display_name = self.personality["name"]
        self.token: Optional[str] = None
        self.user_id: Optional[int] = None
        self.client = httpx.AsyncClient(timeout=30.0)
        self.posts_created = 0
        self.likes_given = 0
        self.follows_made = 0
        
    def _generate_personality(self) -> Dict:
        rand = random.random()
        cumulative = 0
        personality_type = PERSONALITY_TYPES[-1]
        for pt in PERSONALITY_TYPES:
            cumulative += pt["weight"]
            if rand <= cumulative:
                personality_type = pt
                break
        
        name = fake.name() if random.random() < 0.7 else fake.first_name()
        bio_templates = [
            f"{personality_type['type'].capitalize()} | {fake.catch_phrase()}",
            f"Люблю {random.choice(['код', 'дизайн', 'музыку', 'путешествия'])} 🚀",
            f"{random.choice(['Разработчик', 'Дизайнер', 'Студент', 'Фрилансер'])} | {fake.city()}",
            f"{random.choice(['Python', 'JavaScript', 'Go', 'Rust'])} enthusiast",
        ]
        
        return {
            "name": name,
            "bio": random.choice(bio_templates),
            "type": personality_type["type"],
            "styles": personality_type["styles"],
            "activity": random.choices(list(ACTIVITY_LEVELS.keys()), weights=[0.2, 0.6, 0.2], k=1)[0],
            "schedule": random.choice(list(SCHEDULE_TYPES.keys())),
        }
    async def register(self) -> bool:
        try:
            payload = {
                "username": self.username,
                "password": BOT_PASSWORD,
                "display_name": self.display_name,
                "bio": self.personality["bio"],
                "email": f"{self.username}@bot.local"
            }
            
            # Используем правильный путь /api/register
            response = await self.client.post(f"{API_URL}/api/register", json=payload)
            if response.status_code in [200, 201]:
                return True
            else:
                print(f"   ⚠️  {self.username}: {response.status_code} | {response.text[:150]}")
                return False
        except Exception as e:
            print(f"   ❌ {self.username}: {str(e)[:100]}")
            return False

    async def login(self) -> bool:
        try:
            # Используем правильный путь /api/login
            response = await self.client.post(
                f"{API_URL}/api/login",
                json={"username": self.username, "password": BOT_PASSWORD}
            )
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token") or data.get("token")
                self.user_id = data.get("user_id") or data.get("id")
                return True
            return False
        except Exception:
            return False

    async def login(self) -> bool:
        try:
            paths_to_try = ["/auth/login", "/login", "/api/auth/login", "/api/login"]
            for path in paths_to_try:
                response = await self.client.post(
                    f"{API_URL}{path}",
                    json={"username": self.username, "password": BOT_PASSWORD}
                )
                if response.status_code == 200:
                    data = response.json()
                    self.token = data.get("access_token") or data.get("token")
                    self.user_id = data.get("user_id") or data.get("id")
                    return True
                elif response.status_code != 404:
                    return False # Путь найден, но логин не удался (например, неверный пароль)
            return False
        except Exception:
            return False
    
    def _generate_post_content(self) -> str:
        style = random.choice(self.personality["styles"])
        if style == "tech": content = random.choice(TECH_POSTS)
        elif style == "quotes": content = random.choice(QUOTES)
        elif style == "memes": content = random.choice(MEMES)
        elif style == "questions": content = random.choice(QUESTIONS)
        else: content = random.choice(CASUAL_POSTS)
        
        if random.random() < 0.4:
            tags = random.sample(TAGS, k=random.randint(1, 3))
            content += " " + " ".join([f"#{tag}" for tag in tags])
        return content
    
    async def create_post(self) -> bool:
        if not self.token: return False
        try:
            response = await self.client.post(
                f"{API_URL}/api/posts", 
                headers={"Authorization": f"Bearer {self.token}"}, 
                data={"text": self._generate_post_content()}
            )
            if response.status_code == 200:
                self.posts_created += 1
                return True
            return False
        except Exception: return False
    
    async def like_random_post(self) -> bool:
        if not self.token: return False
        try:
            response = await self.client.get(f"{API_URL}/api/posts?limit=50", headers={"Authorization": f"Bearer {self.token}"})
            if response.status_code != 200: return False
            posts = response.json().get("posts", [])
            other_posts = [p for p in posts if p.get("author_id") != self.user_id]
            if not other_posts: return False
            
            post = random.choice(other_posts)
            resp = await self.client.post(f"{API_URL}/api/posts/{post['id']}/like", headers={"Authorization": f"Bearer {self.token}"})
            if resp.status_code == 200:
                self.likes_given += 1
                return True
            return False
        except Exception: return False
    
    async def follow_random_user(self) -> bool:
        if not self.token: return False
        try:
            response = await self.client.get(f"{API_URL}/api/users?limit=50", headers={"Authorization": f"Bearer {self.token}"})
            if response.status_code != 200: return False
            users = response.json()
            other_users = [u for u in users if u.get("id") != self.user_id]
            if not other_users: return False
            
            user = random.choice(other_users)
            resp = await self.client.post(f"{API_URL}/api/users/{user['id']}/follow", headers={"Authorization": f"Bearer {self.token}"})
            if resp.status_code == 200:
                self.follows_made += 1
                return True
            return False
        except Exception: return False
    
    def is_active_now(self) -> bool:
        return datetime.now().hour in SCHEDULE_TYPES[self.personality["schedule"]]
    
    async def run_cycle(self):
        if not self.is_active_now(): return
        action = random.choices(["post", "like", "follow"], weights=[0.4, 0.5, 0.1], k=1)[0]
        if action == "post": await self.create_post()
        elif action == "like": await self.like_random_post()
        else: await self.follow_random_user()
    
    def get_stats(self) -> Dict:
        return {
            "username": self.username, "display_name": self.display_name,
            "personality": self.personality["type"], "activity": self.personality["activity"],
            "posts": self.posts_created, "likes": self.likes_given, "follows": self.follows_made,
        }

# ============================================================

class MassBotManager:
    def __init__(self, num_bots: int):
        self.num_bots = num_bots
        self.bots: List[MassBot] = []
        self.stats = {
            "registered": 0, "active": 0, "total_posts": 0,
            "total_likes": 0, "total_follows": 0, "start_time": datetime.now(),
        }
    
    async def initialize_bots(self):
        print(f"\n🤖 Инициализация {self.num_bots} ботов...")
        for i in range(self.num_bots):
            self.bots.append(MassBot(i))
            if (i + 1) % 100 == 0:
                print(f"   Создано {i + 1}/{self.num_bots} ботов")
        print(f"✅ Все боты созданы\n")
    
    async def register_batch(self, batch_size: int = 1):  # <-- ИЗМЕНИЛИ: теперь по 1 боту
        """Регистрируем ботов ОЧЕНЬ МЕДЛЕННО, чтобы не словить бан от Render"""
        print(f"📝 Регистрация ботов (по {batch_size} с большими паузами)...")
        print(f"   ⚠️  Это займет время, но так мы не получим 429 ошибку\n")
        
        for i in range(0, len(self.bots), batch_size):
            batch = self.bots[i:i+batch_size]
            tasks = [bot.register() for bot in batch]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            success = sum(1 for r in results if r is True)
            self.stats["registered"] += success
            
            # Проверяем, была ли ошибка 429
            has_429 = any(isinstance(r, Exception) or (hasattr(r, 'status_code') and r == 429) for r in results)
            
            if success > 0:
                print(f"   ✅ Зарегистрировано: {self.stats['registered']}/{self.num_bots}")
            else:
                print(f"   ⏳ Пауза из-за rate limit... ({self.stats['registered']}/{self.num_bots})")
            
            # 🔥 ВАЖНО: Большая пауза между батчами
            # Если была ошибка 429 - ждем 60 секунд, иначе 10 секунд
            if has_429 or success == 0:
                print(f"   💤 Ждем 60 секунд, чтобы Render успокоился...")
                await asyncio.sleep(60)
            else:
                await asyncio.sleep(10)  # Обычная пауза
    
    async def login_all(self):
        print(f"\n🔐 Логин ботов...")
        tasks = [bot.login() for bot in self.bots]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        self.stats["active"] = sum(1 for r in results if r is True)
        print(f"✅ Активных ботов: {self.stats['active']}/{self.num_bots}\n")
    
    async def run_simulation(self, duration_hours: int = 24):
        print(f"🚀 Запуск симуляции на {duration_hours} часов...")
        end_time = datetime.now() + timedelta(hours=duration_hours)
        cycle = 0
        
        while datetime.now() < end_time:
            cycle += 1
            current_hour = datetime.now().hour
            active_bots = [bot for bot in self.bots if bot.is_active_now() and bot.token]
            
            if not active_bots:
                print(f"💤 {current_hour}:00 - Все боты спят...")
                await asyncio.sleep(3600)
                continue
            
            print(f"\n🔄 Цикл #{cycle} | {datetime.now().strftime('%H:%M:%S')} | Активных: {len(active_bots)}")
            tasks = [bot.run_cycle() for bot in active_bots]
            await asyncio.gather(*tasks, return_exceptions=True)
            
            self.stats["total_posts"] = sum(bot.posts_created for bot in self.bots)
            self.stats["total_likes"] = sum(bot.likes_given for bot in self.bots)
            self.stats["total_follows"] = sum(bot.follows_made for bot in self.bots)
            
            delay = random.uniform(MIN_DELAY_BOT, MAX_DELAY_BOT)
            print(f"   📊 Постов: {self.stats['total_posts']} | Лайков: {self.stats['total_likes']} | Подписок: {self.stats['total_follows']}")
            print(f"   ⏳ Пауза {delay:.0f} сек...")
            await asyncio.sleep(delay)
    
    def print_final_stats(self):
        duration = datetime.now() - self.stats["start_time"]
        print("\n" + "="*70)
        print("📊 ФИНАЛЬНАЯ СТАТИСТИКА")
        print("="*70)
        print(f"⏱️  Время работы: {duration}")
        print(f"👥 Всего ботов: {self.num_bots}")
        print(f"✅ Зарегистрировано: {self.stats['registered']}")
        print(f"🟢 Активных: {self.stats['active']}")
        print(f"\n📝 Создано постов: {self.stats['total_posts']}")
        print(f"❤️  Дано лайков: {self.stats['total_likes']}")
        print(f"👥 Сделано подписок: {self.stats['total_follows']}")
        
        personality_stats = defaultdict(lambda: {"count": 0, "posts": 0, "likes": 0})
        for bot in self.bots:
            ptype = bot.personality["type"]
            personality_stats[ptype]["count"] += 1
            personality_stats[ptype]["posts"] += bot.posts_created
            personality_stats[ptype]["likes"] += bot.likes_given
        
        print("\n📈 Статистика по типам:")
        for ptype, stats in personality_stats.items():
            print(f"   {ptype:15} | Ботов: {stats['count']:4} | Постов: {stats['posts']:5} | Лайков: {stats['likes']:5}")
        print("="*70)
        
        with open("bot_stats.json", "w", encoding="utf-8") as f:
            json.dump({"summary": self.stats, "bots": [bot.get_stats() for bot in self.bots if bot.token]}, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Детальная статистика сохранена в bot_stats.json")

# ============================================================

async def main():
    import argparse
    parser = argparse.ArgumentParser(description="Массовый бот активности")
    parser.add_argument("--bots", type=int, default=NUM_BOTS, help="Количество ботов")
    parser.add_argument("--hours", type=int, default=24, help="Часы работы")
    args = parser.parse_args()
    
    print("="*70)
    print("🤖 МАССОВЫЙ БОТ АКТИВНОСТИ")
    print("="*70)
    print(f"API: {API_URL}")
    print(f"Количество ботов: {args.bots}")
    print(f"Часы работы: {args.hours}")
    print(f"Скрытая маркировка: префикс '{BOT_PREFIX}'")
    print("="*70)
    
    manager = MassBotManager(args.bots)
    await manager.initialize_bots()
    await manager.register_batch(batch_size=BATCH_SIZE)
    await manager.login_all()
    
    if manager.stats["active"] == 0:
        print("❌ Нет активных ботов. Завершение. Проверь логи выше.")
        return
    
    await manager.run_simulation(duration_hours=args.hours)
    manager.print_final_stats()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n🛑 Бот остановлен пользователем.")