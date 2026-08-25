"""
Интеграционный тест сигналинга WebRTC-звонков (ШАГ 4).

Эмулирует ДВУХ реальных клиентов через WebSocket и прогоняет полный
жизненный цикл звонка против живого сервера:

  ping/pong -> call_initiate -> call_incoming/call_initiated ->
  call_accept -> call_accepted -> call_offer -> call_answer ->
  call_ice_candidate -> call_end -> call_ended

Запуск из папки backend (тот же venv, что и сервер):

  .\\venv\\Scripts\\python.exe test_call_signaling.py --setup   # создать тестовую БД + 2 юзеров
  .\\venv\\Scripts\\python.exe test_call_signaling.py --run     # сценарий звонка (сервер должен быть запущен)

Сервер запускать с ТЕМИ ЖЕ переменными окружения:

  $env:SECRET_KEY="..." ; $env:DATABASE_URL="sqlite:///./test_calls.db"
  .\\venv\\Scripts\\python.exe -m uvicorn main:app --port 8010
"""

import argparse
import asyncio
import datetime
import json
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BACKEND_DIR)

DB_FILE = os.path.join(BACKEND_DIR, "test_calls.db")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_FILE}")
SECRET = os.environ.get("SECRET_KEY", "nebula-super-secret-key-2026-minimum-32-chars")
ALGORITHM = "HS256"
PORT = int(os.environ.get("TEST_PORT", "8010"))

USERS = [
    {"username": "call_tester_a", "display_name": "Caller A"},
    {"username": "call_tester_b", "display_name": "Callee B"},
]


def setup_db() -> None:
    """Идемпотентно создаёт тестовую БД и двух пользователей."""
    from sqlmodel import SQLModel, Session, select

    import models  # noqa: F401  (регистрирует таблицы в metadata)
    from database import engine
    from models import User

    # ВАЖНО: таблицы создаём той же engine, что получит сервер
    # (database.py читает DATABASE_URL из окружения при импорте).
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        for spec in USERS:
            existing = session.exec(
                select(User).where(User.username == spec["username"])
            ).first()
            if existing:
                print(f"👤 user exists: {spec['username']} id={existing.id}")
                continue
            user = User(
                username=spec["username"],
                display_name=spec["display_name"],
                password_hash="test-not-a-login-hash",
            )
            session.add(user)
            session.commit()
            session.refresh(user)
            print(f"👤 user created: {spec['username']} id={user.id}")


def get_user_ids() -> tuple:
    from sqlmodel import Session, select

    from database import engine
    from models import User

    ids = []
    with Session(engine) as session:
        for spec in USERS:
            user = session.exec(
                select(User).where(User.username == spec["username"])
            ).first()
            assert user is not None, f"user {spec['username']} не найден — сначала --setup"
            ids.append(user.id)
    return ids[0], ids[1]


def make_token(user_id: int) -> str:
    import jwt

    payload = {
        "sub": str(user_id),
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


RESULTS = []


def check(name: str, ok: bool, extra: str = "") -> None:
    RESULTS.append((name, ok, extra))
    mark = "✅ PASS" if ok else "❌ FAIL"
    print(f"{mark} | {name}" + (f" | {extra}" if extra else ""))


async def recv_event(ws, expected_event: str, timeout: float = 10.0) -> dict:
    """Читает поток сообщений, пока не придёт ожидаемое событие."""
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        if raw == "pong":
            continue
        try:
            msg = json.loads(raw)
        except (ValueError, TypeError):
            raise AssertionError(f"сервер прислал не-JSON: {raw[:120]!r}")
        event = msg.get("event")
        if event == expected_event:
            return msg.get("data") or {}
        raise AssertionError(
            f"ожидали '{expected_event}', пришло '{event}': {json.dumps(msg)[:200]}"
        )


async def run_flow() -> None:
    import websockets

    caller_id, callee_id = get_user_ids()
    uri = f"ws://127.0.0.1:{PORT}/ws"

    async with websockets.connect(f"{uri}?token={make_token(caller_id)}") as a, \
               websockets.connect(f"{uri}?token={make_token(callee_id)}") as b:

        # --- 0. Keep-alive жив + мусорный JSON не роняет соединение ---
        await a.send("ping")
        pong_raw = await asyncio.wait_for(a.recv(), timeout=10)
        check("ping -> pong", json.loads(pong_raw).get("event") == "pong", pong_raw[:40])

        await a.send(json.dumps({"type": "unknown_garbage_signal"}))
        await a.send("ping")
        pong2 = json.loads(await asyncio.wait_for(a.recv(), timeout=10))
        check("unknown signal ignored, connection alive", pong2.get("event") == "pong")

        # --- 1. call_initiate -> call_incoming (B) + call_initiated (A) ---
        await a.send(json.dumps({
            "type": "call_initiate",
            "target_user_id": callee_id,
            "call_type": "video",
            "caller_name": "Alice",
            "caller_avatar": "https://cdn.test/a.png",
        }))
        incoming = await recv_event(b, "call_incoming")
        initiated = await recv_event(a, "call_initiated")

        check("B получил call_incoming", bool(incoming), json.dumps(incoming)[:120])
        check("A получил call_initiated (ack)", bool(initiated), json.dumps(initiated)[:120])
        call_id = initiated.get("call_id")
        check("call_id сгенерирован сервером и совпадает",
              isinstance(call_id, str) and call_id == incoming.get("call_id"),
              repr(call_id))
        check("incoming.caller_id == id инициатора", incoming.get("caller_id") == caller_id,
              str(incoming.get("caller_id")))
        check("incoming.call_type == video", incoming.get("call_type") == "video",
              str(incoming.get("call_type")))
        check("incoming.caller_name прокинут", incoming.get("caller_name") == "Alice",
              str(incoming.get("caller_name")))

        # --- 2. call_accept -> call_accepted ---
        await b.send(json.dumps({
            "type": "call_accept", "call_id": call_id, "target_user_id": caller_id,
        }))
        accepted = await recv_event(a, "call_accepted")
        check("A получил call_accepted", accepted.get("call_id") == call_id,
              json.dumps(accepted)[:100])

        # --- 3. SDP offer релеится без искажений ---
        offer_sdp = {"type": "offer", "sdp": "v=0\r\no=- 111 111 IN IP4 127.0.0.1\r\ns=-\r\n"}
        await a.send(json.dumps({
            "type": "call_offer", "call_id": call_id,
            "target_user_id": callee_id, "sdp": offer_sdp,
        }))
        offer = await recv_event(b, "call_offer")
        check("B получил call_offer c тем же SDP",
              offer.get("sdp") == offer_sdp and offer.get("call_id") == call_id,
              json.dumps(offer)[:120])
        check("служебные поля вырезаны из payload",
              "type" not in offer and "target_user_id" not in offer)

        # --- 4. SDP answer релеится обратно ---
        answer_sdp = {"type": "answer", "sdp": "v=0\r\no=- 222 222 IN IP4 127.0.0.1\r\ns=-\r\n"}
        await b.send(json.dumps({
            "type": "call_answer", "call_id": call_id,
            "target_user_id": caller_id, "sdp": answer_sdp,
        }))
        answer = await recv_event(a, "call_answer")
        check("A получил call_answer c тем же SDP",
              answer.get("sdp") == answer_sdp and answer.get("call_id") == call_id,
              json.dumps(answer)[:120])

        # --- 5. ICE-кандидаты релеятся в обе стороны ---
        candidate = {
            "candidate": "candidate:1 1 udp 2122260223 192.168.1.50 51234 typ host",
            "sdpMid": "0", "sdpMLineIndex": 0,
        }
        await b.send(json.dumps({
            "type": "call_ice_candidate", "call_id": call_id,
            "target_user_id": caller_id, "candidate": candidate,
        }))
        ice = await recv_event(a, "call_ice_candidate")
        check("A получил ICE-кандидат от B без искажений",
              ice.get("candidate") == candidate, json.dumps(ice)[:140])

        candidate2 = dict(candidate)
        candidate2["candidate"] = candidate["candidate"].replace("192.168.1.50", "10.0.0.7")
        await a.send(json.dumps({
            "type": "call_ice_candidate", "call_id": call_id,
            "target_user_id": callee_id, "candidate": candidate2,
        }))
        ice2 = await recv_event(b, "call_ice_candidate")
        check("B получил ICE-кандидат от A без искажений",
              ice2.get("candidate") == candidate2, json.dumps(ice2)[:140])

        # --- 6. call_end -> call_ended ---
        await a.send(json.dumps({
            "type": "call_end", "call_id": call_id, "target_user_id": callee_id,
        }))
        ended = await recv_event(b, "call_ended")
        check("B получил call_ended", ended.get("call_id") == call_id,
              json.dumps(ended)[:100])


async def main_run() -> int:
    try:
        await asyncio.wait_for(run_flow(), timeout=60)
    except Exception as exc:  # noqa: BLE001 — диагностика любых сбоев сценария
        check("сценарий завершился без исключений", False, f"{type(exc).__name__}: {exc}")

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    total = len(RESULTS)
    print("=" * 62)
    print(f"ИТОГ: {passed}/{total} проверок пройдено")
    for name, ok, extra in RESULTS:
        if not ok:
            print(f"   ❌ {name} :: {extra}")
    return 0 if passed == total and total > 0 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="WebRTC signaling integration test")
    parser.add_argument("--setup", action="store_true", help="создать тестовую БД и юзеров")
    parser.add_argument("--run", action="store_true", help="прогнать сценарий звонка")
    args = parser.parse_args()

    if args.setup:
        setup_db()
        print("Setup complete.")
        sys.exit(0)
    if args.run:
        sys.exit(asyncio.run(main_run()))
    parser.print_help()

