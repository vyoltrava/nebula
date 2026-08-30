#!/usr/bin/env python3
"""
Генератор SECRET_KEY для backend/.env

Использование:
    python scripts/generate_secret.py            # вывести ключ
    python scripts/generate_secret.py >> .env    # добавить в .env (осторожно с дублями!)
"""
import secrets
import sys
import os

if __name__ == "__main__":
    key = secrets.token_hex(48)  # 96 hex-символов = 48 байт энтропии
    if "--env" in sys.argv:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        exists = os.path.exists(env_path) and "SECRET_KEY" in open(env_path, encoding="utf-8", errors="ignore").read()
        if exists:
            print("ERROR: SECRET_KEY already exists in .env — refusing to overwrite.", file=sys.stderr)
            sys.exit(1)
        with open(env_path, "a", encoding="utf-8") as f:
            f.write(f"\nSECRET_KEY={key}\n")
        print("SECRET_KEY appended to backend/.env")
    else:
        print(key)
