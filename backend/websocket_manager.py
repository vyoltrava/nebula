"""
WebSocket менеджер подключений.
Хранит активные соединения пользователей и умеет рассылать события.
"""

from fastapi import WebSocket
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session, select
from typing import Dict, Set, Any
import json
import asyncio
import logging


logger = logging.getLogger("websocket")


class ConnectionManager:
    def __init__(self):
        # user_id -> set of WebSocket connections
        # set, потому что у одного пользователя может быть несколько вкладок
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        """Принимает соединение и добавляет в список активных"""
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()

            self.active_connections[user_id].add(websocket)

        logger.info(
            "WS connected: user=%s total=%s",
            user_id,
            self.total_connections,
        )

    async def disconnect(self, websocket: WebSocket, user_id: int):
        """Удаляет соединение"""
        async with self._lock:
            connections = self.active_connections.get(user_id)

            if not connections:
                return

            connections.discard(websocket)

            if not connections:
                del self.active_connections[user_id]

        logger.info(
            "WS disconnected: user=%s total=%s",
            user_id,
            self.total_connections,
        )

    async def send_to_user(self, user_id: int, event: str, data: Any):
        """Отправить событие конкретному пользователю"""
        async with self._lock:
            connections = list(self.active_connections.get(user_id, set()))

        if not connections:
            return

        message = json.dumps(
            {
                "event": event,
                "data": data,
            },
            default=str,
        )

        dead_connections = []

        for websocket in connections:
            try:
                await websocket.send_text(message)
            except Exception:
                dead_connections.append(websocket)

        if dead_connections:
            async with self._lock:
                active = self.active_connections.get(user_id)

                if active is None:
                    return

                for websocket in dead_connections:
                    active.discard(websocket)

                if not active:
                    del self.active_connections[user_id]

    async def broadcast_to_users(self, user_ids: list[int], event: str, data: Any):
        """Отправить событие нескольким пользователям"""
        unique_user_ids = list(set(user_ids))

        if not unique_user_ids:
            return

        await asyncio.gather(
            *(
                self.send_to_user(user_id, event, data)
                for user_id in unique_user_ids
            ),
            return_exceptions=True,
        )

    async def broadcast_all(self, event: str, data: Any):
        """Отправить событие всем подключённым пользователям"""
        user_ids = list(self.active_connections.keys())

        if not user_ids:
            return

        await asyncio.gather(
            *(
                self.send_to_user(user_id, event, data)
                for user_id in user_ids
            ),
            return_exceptions=True,
        )

    async def broadcast_to_chat(self, chat_id: int, event: str, data: Any, session: Session):
        """Отправить событие всем участникам чата"""
        from models import ChatMember

        def get_chat_member_ids():
            return session.exec(
                select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
            ).all()

        user_ids = await run_in_threadpool(get_chat_member_ids)

        print(f"🚀 [WS BACKEND] Пытаюсь отправить '{event}' в чат {chat_id}. Участники: {user_ids}")


        await self.broadcast_to_users(user_ids, event, data)

    async def broadcast_to_followers(
        self,
        author_id: int,
        event: str,
        data: Any,
        session: Session,
    ):
        """Отправить событие всем подписчикам автора"""
        from models import Follow

        def get_follower_ids():
            return session.exec(
                select(Follow.follower_id).where(Follow.followee_id == author_id)
            ).all()

        follower_ids = await run_in_threadpool(get_follower_ids)

        await self.broadcast_to_users(follower_ids, event, data)

    @property
    def total_connections(self) -> int:
        return sum(len(connections) for connections in self.active_connections.values())

    def get_online_user_ids(self) -> set[int]:
        """Список ID пользователей, которые сейчас онлайн"""
        return set(self.active_connections.keys())


# Глобальный singleton — доступен из любого модуля
manager = ConnectionManager()