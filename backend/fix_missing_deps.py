
# fix_missing_deps.py
import os

dep_file = "dependencies.py"

if os.path.exists(dep_file):
    with open(dep_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Если функции ещё нет, добавляем её в конец файла
    if "def generate_code" not in content:
        extra_code = """

# ==========================================
# ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ AUTH (добавлено автоматически)
# ==========================================
import random
import logging

def generate_code() -> str:
    \"\"\"Генерирует 6-значный код для сброса пароля или 2FA\"\"\"
    return f"{random.randint(100000, 999999)}"

def send_password_reset_email(email: str, code: str, display_name: str):
    \"\"\"
    Заглушка для отправки email. 
    TODO: Подключить реальный SMTP (SendGrid, Resend, Mailgun и т.д.)
    \"\"\"
    logging.info(f"📧 [MOCK EMAIL] Код сброса пароля для {email} ({display_name}): {code}")
    # Здесь позже можно добавить реальную логику отправки
"""
        with open(dep_file, "a", encoding="utf-8") as f:
            f.write(extra_code)
        print("✅ Функции generate_code и send_password_reset_email добавлены в dependencies.py")
    else:
        print("✅ Функции уже присутствуют в dependencies.py")
else:
    print("⚠️ Файл dependencies.py не найден!")

print("\n🚀 Теперь выполни:")
print("git add .")
print("git commit -m 'Fix: add missing generate_code and send_password_reset_email to dependencies'")
print("git push origin main")

