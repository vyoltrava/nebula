"""
🛡️ make_admin.py — выдача прав администратора / системного аккаунта в локальной БД.

Работает с той БД, что указана в DATABASE_URL (по умолчанию — файл nebula.db,
в том числе в fallback-режиме). Использование:

  # Выдать is_admin существующему юзеру (аккаунт должен существовать):
  python make_admin.py ivan

  # Создать системный аккаунт сразу с правами «всего доступа» (is_trelod):
  python make_admin.py system --password "Очень!Сложный_Пароль123" --trelod

  # Просто создать админа:
  python make_admin.py boss --password "Пароль456!"

  # Забрать права:
  python make_admin.py boss --revoke

Уровни доступа:
  is_admin   → ВСЕ права стAFF-панели (ALL_PERMISSIONS), уровень 10
  is_trelod  → системный аккаунт: ALL_PERMISSIONS + уровень 11 (выше админа)
"""
import sys
import getpass
from database import engine, init_db, DATABASE_URL
from sqlmodel import Session, select
from models import User


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    username = args[0].strip().lower()
    set_password = None
    make_trelod = False
    revoke = False
    i = 1
    while i < len(args):
        a = args[i]
        if a == "--password":
            i += 1
            set_password = args[i]
        elif a == "--trelod":
            make_trelod = True
        elif a == "--revoke":
            revoke = True
        elif a == "--stdin-password":
            set_password = getpass.getpass("Пароль: ")
        else:
            print(f"⚠️ Неизвестный аргумент: {a}")
            sys.exit(1)
        i += 1

    if not set_password and not revoke:
        set_password = getpass.getpass(f"Пароль для '{username}' (Enter = не менять, только права): ")

    init_db()  # гарантируем, что таблицы есть

    import bcrypt

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()

        if user is None:
            if not set_password:
                print(f"❌ Юзер '{username}' не найден, а пароль не задан. "
                      f"Сначала зарегистрируй его на сайте или передай --password.")
                sys.exit(1)
            pw_hash = bcrypt.hashpw(set_password.encode(), bcrypt.gensalt()).decode()
            user = User(
                username=username,
                display_name=username,
                password_hash=pw_hash,
                is_admin=not make_trelod,
                is_trelod=make_trelod,
            )
            print(f"✅ Создан аккаунт '{username}'")
        else:
            print(f"ℹ️ Аккаунт '{username}' существует (id={user.id})")

        if revoke:
            user.is_admin = False
            user.is_moderator = False
            user.is_trelod = False
            print(f"✅ Права у '{username}' сняты")
        else:
            user.is_admin = True
            if make_trelod:
                user.is_trelod = True
            if set_password:
                user.password_hash = bcrypt.hashpw(set_password.encode(), bcrypt.gensalt()).decode()
                print(f"🔑 Пароль обновлён")
            print(f"✅ '{username}': is_admin=True" + (", is_trelod=True (системный)" if make_trelod else ""))

        session.add(user)
        session.commit()
        print(f"🗄 БД: {DATABASE_URL}")


if __name__ == "__main__":
    main()
