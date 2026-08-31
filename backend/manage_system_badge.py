"""
Управление системными плашками (уровни 9-11) напрямую из БД.

Запускать там, где крутится бэкенд (папка nebula/backend, окружение из .env):

    python manage_system_badge.py list
    python manage_system_badge.py reset 10            # удалить плашку Founder -> вернётся белая по умолчанию
    python manage_system_badge.py reset 9 10 11       # удалить несколько
    python manage_system_badge.py set 10 --bg "#ffffff" --grad "linear-gradient(135deg,#ffffff,#e5e7eb)" --text "#0a0a0a" --text-content "FOUNDER" --border "#ffffff" --glow
    python manage_system_badge.py promote myusername  # сделать аккаунт is_admin=True (уровень 10, Founder)

Что важно:
- reset (удаление) SystemBadge уровня -> фронт RoleBadge вернётся к обычной плашке.
- set пишет поля плашки; без --bg/--grad фон останется прежним.
"""
import sys


def main():
    from database import engine
    from sqlmodel import Session, select
    from models import SystemBadge, User

    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return

    cmd = args[0]
    with Session(engine) as s:
        if cmd == "list":
            rows = s.exec(select(SystemBadge).order_by(SystemBadge.level)).all()
            if not rows:
                print("Системных плашек нет (уровни 9-11) — используется дефолт на фронте.")
            for b in rows:
                print(
                    f"level={b.level} name={b.name!r} text={b.text_content!r} "
                    f"bg={b.bg_color!r}/{b.bg_type} border={b.border_color!r} glow={b.border_glow} active={b.is_active}"
                )
            return

        if cmd == "promote":
            username = args[1]
            u = s.exec(select(User).where(User.username == username)).first()
            if not u:
                print(f"Пользователь @{username} не найден")
                return
            u.is_admin = True
            s.add(u)
            s.commit()
            print(f"@{username} (id={u.id}) теперь is_admin=True, уровень 10 (Founder)")
            return

        if cmd == "reset":
            levels = [int(x) for x in args[1:]]
            for lvl in levels:
                b = s.get(SystemBadge, lvl)
                if b:
                    s.delete(b)
                    print(f"Плашка уровня {lvl} удалена (вернётся дефолт на фронте).")
                else:
                    print(f"Плашки уровня {lvl} и так нет.")
            s.commit()
            return

        if cmd == "set":
            level = int(args[1])
            rest = args[2:]
            data = {}
            i = 0
            while i < len(rest):
                flag = rest[i]
                if flag == "--bg" and i + 1 < len(rest):
                    data["bg_color"] = rest[i + 1]; data["bg_type"] = "solid"; i += 2
                elif flag == "--grad" and i + 1 < len(rest):
                    data["bg_gradient"] = rest[i + 1]; data["bg_type"] = "gradient"; i += 2
                elif flag == "--text" and i + 1 < len(rest):
                    data["text_color"] = rest[i + 1]; i += 2
                elif flag == "--text-content" and i + 1 < len(rest):
                    data["text_content"] = rest[i + 1]; data["name"] = rest[i + 1]; i += 2
                elif flag == "--border" and i + 1 < len(rest):
                    data["border_color"] = rest[i + 1]; data["border_width"] = 2; i += 2
                elif flag == "--glow":
                    data["border_glow"] = True; data["border_glow_intensity"] = 70; i += 1
                else:
                    i += 1

            b = s.get(SystemBadge, level)
            if not b:
                b = SystemBadge(level=level, name=data.get("name") or "Level")
                s.add(b)
            for k, v in data.items():
                setattr(b, k, v)
            s.commit()
            print(f"Плашка уровня {level} обновлена: {data}")
            return

        print(__doc__)


if __name__ == "__main__":
    main()