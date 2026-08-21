"""
WebSocket менеджер подключений.
Хранит активные соединения пользователей и умеет рассылать события.
"""

from fastapi import WebSocket
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select
from typing import Dict, Set, Any, Optional
import json
import asyncio
import logging
import time

logger = logging.getLogger("websocket")


class ConnectionManager:
    def __init__(self):
        # user_id -> set of WebSocket connections
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        """Принимает соединение и добавляет в список активных"""
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)

        logger.info("WS connected: user=%s total=%s", user_id, self.total_connections)

    async def disconnect(self, websocket: WebSocket, user_id: int):
        """Удаляет соединение"""
        async with self._lock:
            connections = self.active_connections.get(user_id)
            if not connections:
                return

            connections.discard(websocket)
            if not connections:
                del self.active_connections[user_id]

        logger.info("WS disconnected: user=%s total=%s", user_id, self.total_connections)

    async def send_to_user(self, user_id: int, event: str, data: Any):
        """Отправить событие конкретному пользователю"""
        async with self._lock:
            connections = list(self.active_connections.get(user_id, set()))

        if not connections:
            return

        message = json.dumps({"event": event, "data": data}, default=str)
        dead_connections = []

        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)

        if dead_connections:
            async with self._lock:
                active = self.active_connections.get(user_id)
                if active is None:
                    return
                for ws in dead_connections:
                    active.discard(ws)
                if not active:
                    del self.active_connections[user_id]

    async def broadcast_to_users(self, user_ids: list[int], event: str, data: Any):
        """Отправить событие нескольким пользователям"""
        unique_user_ids = list(set(user_ids))
        if not unique_user_ids:
            return
        await asyncio.gather(
            *(self.send_to_user(uid, event, data) for uid in unique_user_ids),
            return_exceptions=True,
        )

    async def broadcast_all(self, event: str, data: Any):
        """Отправить событие всем подключённым пользователям"""
        user_ids = list(self.active_connections.keys())
        if not user_ids:
            return
        await asyncio.gather(
            *(self.send_to_user(uid, event, data) for uid in user_ids),
            return_exceptions=True,
        )

    async def broadcast_to_chat(self, chat_id: int, event: str, data: Any, session: Session):
        """Отправить событие всем участникам чата"""
        from models import ChatMember

        def get_chat_member_ids():
            return session.exec(select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)).all()

        user_ids = await run_in_threadpool(get_chat_member_ids)
        logger.info(f" [WS BACKEND] Отправка '{event}' в чат {chat_id}. Участники: {user_ids}")
        await self.broadcast_to_users(user_ids, event, data)

    async def broadcast_to_followers(self, author_id: int, event: str, data: Any, session: Session):
        """Отправить событие всем подписчикам автора"""
        from models import Follow

        def get_follower_ids():
            return session.exec(select(Follow.follower_id).where(Follow.followee_id == author_id)).all()

        follower_ids = await run_in_threadpool(get_follower_ids)
        await self.broadcast_to_users(follower_ids, event, data)

    @property
    def total_connections(self) -> int:
        return sum(len(conns) for conns in self.active_connections.values())

    def get_online_user_ids(self) -> set[int]:
        return set(self.active_connections.keys())


# Глобальный singleton
manager = ConnectionManager()

# Состояние активных звонков
active_calls: Dict[str, dict] = {}


class CallSignaling:
    """Обработка сигналов WebRTC для звонков"""

    @staticmethod
    async def handle_call_message(websocket: WebSocket, data: dict, current_user_id: int):
        msg_type = data.get("type")
        call_id = data.get("call_id")

        # 🔥 ИСПРАВЛЕНИЕ: target_user_id нужен ТОЛЬКО для инициации
        if msg_type == "call_initiate":
            target_user_id = data.get("target_user_id")
            if not target_user_id:
                await manager.send_to_user(current_user_id, "call_error", {"error": "target_user_id required"})
                return
            
            # Создаем новый звонок
            new_call_id = f"call_{current_user_id}_{target_user_id}_{int(time.time())}"
            active_calls[new_call_id] = {
                "caller_id": current_user_id,
                "receiver_id": target_user_id,
                "call_type": data.get("call_type", "audio"),
                "status": "ringing",
                "created_at": time.time()
            }

            # Уведомляем принимающего
            await manager.send_to_user(target_user_id, "call_incoming", {
                "call_id": new_call_id,
                "caller_id": current_user_id,
                "caller_name": data.get("caller_name", ""),
                "caller_avatar": data.get("caller_avatar", ""),
                "call_type": data.get("call_type", "audio")
            })

            # Подтверждаем инициатору (возвращаем сгенерированный ID)
            await manager.send_to_user(current_user_id, "call_initiated", {
                "call_id": new_call_id,
                "target_user_id": target_user_id
            })
            return

        # Для остальных сообщений проверяем существование звонка
        if not call_id or call_id not in active_calls:
            # Если звонка нет в списке (например, истек таймаут), игнорируем или шлем ошибку
            # logger.warning(f"Call {call_id} not found for message type {msg_type}")
            return

        call_data = active_calls[call_id]
        caller_id = call_data["caller_id"]
        receiver_id = call_data["receiver_id"]

        # Определяем, кому слать, в зависимости от того, кто отправил
        if current_user_id == caller_id:
            target_id = receiver_id
        else:
            target_id = caller_id

        if msg_type == "call_accept":
            call_data["status"] = "connecting"
            await manager.send_to_user(caller_id, "call_accepted", {
                "call_id": call_id,
                "receiver_id": current_user_id
            })

        elif msg_type == "call_reject":
            call_data["status"] = "rejected"
            await manager.send_to_user(caller_id, "call_rejected", {
                "call_id": call_id,
                "receiver_id": current_user_id
            })
            del active_calls[call_id]

        elif msg_type == "call_offer":
            # Пересылаем Offer получателю
            await manager.send_to_user(receiver_id, "call_offer", {
                "call_id": call_id,
                "sdp": data.get("sdp")
            })

        elif msg_type == "call_answer":
            call_data["status"] = "active"
            # Пересылаем Answer инициатору
            await manager.send_to_user(caller_id, "call_answer", {
                "call_id": call_id,
                "sdp": data.get("sdp")
            })

        elif msg_type == "call_ice_candidate":
            # Пересылаем ICE candidate противоположной стороне
            await manager.send_to_user(target_id, "call_ice_candidate", {
                "call_id": call_id,
                "candidate": data.get("candidate")
            })

        elif msg_type == "call_end":
            await manager.send_to_user(target_id, "call_ended", {
                "call_id": call_id,
                "ended_by": current_user_id
            })
            del active_calls[call_id]

        elif msg_type == "call_busy":
            await manager.send_to_user(caller_id, "call_busy", {
                "call_id": call_id,
                "receiver_id": current_user_id
            })
            del active_calls[call_id]


def cleanup_stale_calls():
    """Удаляем звонки старше 60 секунд (не принятые)"""
    now = time.time()
    stale = [cid for cid, c in active_calls.items() if c["status"] == "ringing" and now - c["created_at"] > 60]
    for cid in stale:
        call = active_calls.pop(cid)
        logger.info(f"Cleaned up stale call: {cid}")