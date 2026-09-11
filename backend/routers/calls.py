# routers/calls.py
# Endpoints вынесены из main.py. Общие зависимости — из dependencies.py.
import json, os, re, uuid, base64, io, time, secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query, Response, Body, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlmodel import Session, select, delete, func, update
import cloudinary
from database import get_session
from models import *
from dependencies import *
from dependencies import manager

router = APIRouter()


# ==== (миграция из main.py) ====
@router.post("/api/calls/initiate")
@limiter.limit("10/minute")
async def relay_call_initiate(
    request: Request,
    data: RelayCallIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    print(f"[RELAY] initiate by {user.id} -> {data.target_user_id} type={data.call_type}")
    if data.target_user_id == user.id:
        raise HTTPException(400, "Нельзя позвонить себе")
    target = session.get(User, data.target_user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if not _privacy_allows(target, user.id, "calls", session):
        raise HTTPException(403, "Пользователь запретил звонки")

    call_id = f"relay-{user.id}-{data.target_user_id}-{uuid.uuid4().hex[:8]}"
    async with _relay_calls_lock:
        _relay_calls[call_id] = {
            "a": user.id, "b": data.target_user_id,
            "a_name": user.display_name, "b_name": target.display_name,
            "a_avatar": user.avatar_url, "b_avatar": target.avatar_url,
            "status": "ringing", "call_type": data.call_type,
        }

    await manager.send_to_user(data.target_user_id, "relay_call_incoming", {
        "call_id": call_id,
        "caller_id": user.id,
        "caller_name": user.display_name,
        "caller_avatar": user.avatar_url,
        "call_type": data.call_type,
    })
    print(f"[Relay] incoming sent to {data.target_user_id}")
    return {"call_id": call_id, "status": "ringing", "target_user_id": data.target_user_id}


@router.post("/api/calls/action")
async def relay_call_action(
    data: RelayCallAction,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    print(f"[Relay] action {data.action} on {data.call_id} by {user.id}")
    async with _relay_calls_lock:
        call = _relay_calls.get(data.call_id)
        if not call:
            raise HTTPException(404, "Звонок не найден")
        other = call["b"] if user.id == call["a"] else call["a"]
        if data.action == "accept":
            call["status"] = "active"
            await manager.send_to_user(call["a"], "relay_call_accepted", {"call_id": data.call_id})
            await manager.send_to_user(other, "relay_call_active", {"call_id": data.call_id})
            print(f"[Relay] accepted: {data.call_id}")
        elif data.action == "reject":
            call["status"] = "ended"
            await manager.send_to_user(call["a"], "relay_call_rejected", {"call_id": data.call_id})
            print(f"[Relay] rejected by {user.id}")
        elif data.action == "end":
            call["status"] = "ended"
            # уведомляем обратный участник о завершении
            await manager.send_to_user(call["b"] if user.id == call["a"] else call["a"], "relay_call_ended", {"call_id": data.call_id})
            # завершившему тоже (сбрасываем UI)
            await manager.send_to_user(user.id, "relay_call_ended", {"call_id": data.call_id})
            _relay_calls.pop(data.call_id, None)
            _relay_ws.pop(data.call_id, None)
            print(f"[Relay] ended -> {data.call_id}")
        return {"ok": True}


@router.websocket("/api/calls/{call_id}/stream")
async def relay_call_stream(websocket: WebSocket, call_id: str):
    """Поток медиа участника: релеим чанки другому участнику. Двусторонне."""
    token = websocket.query_params.get("token")
    user_id = None
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:
            user_id = None

    async with _relay_calls_lock:
        call = _relay_calls.get(call_id)
        if not call or user_id not in (call["a"], call["b"]):
            await websocket.close(code=4403, reason="not a participant")
            return
        peer = call["b"] if user_id == call["a"] else call["a"]
        if call_id not in _relay_ws:
            _relay_ws[call_id] = {}
        _relay_ws[call_id][user_id] = websocket
    print(f"[Relay] stream ws joined call={call_id} user={user_id}")

    await websocket.accept()
    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break
            data_bytes = message.get("bytes")
            text = message.get("text")
            if data_bytes is None and text is None:
                continue
            # релей другому участнику (и бинарные чанки, и текстовый meta)
            async with _relay_calls_lock:
                peers = _relay_ws.get(call_id)
                pw = None
                if peers:
                    pw = peers.get(peer)
            if pw is not None:
                try:
                    if data_bytes is not None:
                        await pw.send_bytes(data_bytes)
                    elif text is not None:
                        await pw.send_text(text)
                except Exception as e:
                    print(f"[Relay] peer send failed: {e}")
    except Exception as e:
        print(f"[Relay] stream error {call_id}: {e}")
    finally:
        async with _relay_calls_lock:
            w = _relay_ws.get(call_id)
            if w and w.get(user_id) is websocket:
                del w[user_id]
                if not w:
                    _relay_ws.pop(call_id, None)
        print(f"[Relay] stream ws left call={call_id} user={user_id}")


@router.get("/api/ice-servers")
async def api_get_ice_servers(user: User = Depends(get_current_user)):
    """Список iceServers для WebRTC-звонков.

    Приоритет источников:
      1) Эфемерные креды через Metered API (если задан METERED_API_KEY)
      2) Статические METERED_USERNAME / METERED_PASSWORD
      3) Пустой список -> фронтенд использует свой локальный STUN-фолбэк
    Кэш 4 минуты, чтобы не дёргать внешний API на каждый звонок.
    """
    now = time.time()
    if _ice_servers_cache["servers"] is not None and now < _ice_servers_cache["expires"]:
        return {"iceServers": _ice_servers_cache["servers"], "cached": True, "configured": True}

    api_key = os.getenv("METERED_API_KEY", "").strip()
    username = os.getenv("METERED_USERNAME", "").strip()
    password = os.getenv("METERED_PASSWORD", "").strip()
    domain = os.getenv("METERED_DOMAIN", "").strip() or "nebula"

    servers: list = []

    async def _fetch_metered_creds(key: str, dom: str):
        """Получить TURN-креды у Metered. Правильный endpoint Registrar:
        vts.<subdomain>.metered.live / vts.metered.live с параметром apiKey.
        Пробуем оба хоста — кастомный домен и дефолтный."""
        import httpx  # локальный импорт: больше нигде в main.py не нужен
        urls = [
            f"https://vts.{dom}.metered.live/api/v1/turn/credentials",
            "https://vts.metered.live/api/v1/turn/credentials",
        ]
        for base in urls:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.get(base, params={"apiKey": key})
                    resp.raise_for_status()
                    return resp.json()
            except Exception as e:  # noqa: BLE001 — пробуем следующий хост
                print(f"⚠️ Metered API failed ({base}): {e}")
        return None

    # --- 1) Эфемерные креды через Metered API ---
    if api_key:
        try:
            raw = _fetch_metered_creds(api_key, domain)
            if isinstance(raw, list):
                servers = [
                    s for s in raw
                    if isinstance(s, dict) and s.get("urls")
                ]
                # 🔥 FIX: публичный Google-STUN добавляем ВСЕГДА первым.
                # Если DNS провайдера блокирует домен TURN-сервера (errorCode 701),
                # srflx через Google остаётся шансом на прямое P2P-соединение.
                servers.insert(0, {
                    "urls": [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                    ]
                })
            elif raw is None:
                print("⚠️ Metered API вернул пусто — fallback to static creds")
            else:
                print("⚠️ Metered API вернул не list — fallback to static creds")
        except Exception as e:  # noqa: BLE001 — внешний сервис, любой сбой => фолбэк
            print(f"⚠️ Metered API failed ({e}) — fallback to static creds")

    # --- 2) Статические креды из env (фолбэк) ---
    if not servers and username and password:
        # 🔥 Поддержка НЕСКОЛЬКИХ хостов через запятую:
        #   METERED_TURN_HOST=vps-turn.mydomain.ru,relay.metered.ca
        # Так можно поставить свой coturn на доступный из РФ VPS и оставить
        # Metered вторым эшелоном. Креды применяются ко всем хостам одинаково.
        raw_hosts = os.getenv("METERED_TURN_HOST", "").strip() or "relay.metered.ca"
        hosts = [h.strip() for h in raw_hosts.split(",") if h.strip()]
        entries = []
        for h in hosts:
            entries.append({
                "urls": [
                    f"turns:{h}:443?transport=tcp",
                    f"turn:{h}:443?transport=tcp",
                    f"turn:{h}:80?transport=tcp",
                    f"turn:{h}:3478?transport=udp",
                ],
                "username": username,
                "credential": password,
            })
        servers = [
            {"urls": [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ]},
            *entries,
        ]

    if servers:
        _ice_servers_cache["servers"] = servers
        _ice_servers_cache["expires"] = now + 240.0

    return {"iceServers": servers, "cached": False, "configured": bool(servers)}

