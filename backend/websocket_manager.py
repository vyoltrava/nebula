"""
WebSocket менеджер подключений.
Хранит активные соединения пользователей и умеет рассылать события.
"""
from fastapi import WebSocket
from typing import Dict, Set, Optional, Any
from sqlmodel import Session, select
import json
import asyncio



class ConnectionManager:
    def __init__(self):
        # user_id -> set of WebSocket connections
        # (set, потому что у одного пользователя может быть несколько вкладок)
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: int):
        """Принимает соединение и добавляет в список активных"""
        await websocket.accept()
        async with self._lock:
            if user_id not in self.active_connections:
                self.active_connections[user_id] = set()
            self.active_connections[user_id].add(websocket)
        print(f"✅ WS connected: user {user_id} (total: {self.total_connections})")

    def disconnect(self, websocket: WebSocket, user_id: int):
        """Удаляет соединение"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        print(f"❌ WS disconnected: user {user_id} (total: {self.total_connections})")

    async def send_to_user(self, user_id: int, event: str, data: Any):
        """Отправить событие конкретному пользователю"""
        if user_id not in self.active_connections:
            return
        
        message = json.dumps({"event": event, "data": data})
        dead_connections = []
        
        for websocket in self.active_connections[user_id]:
            try:
                await websocket.send_text(message)
            except Exception:
                dead_connections.append(websocket)
        
        # Чистим мёртвые соединения
        for ws in dead_connections:
            self.active_connections[user_id].discard(ws)
    
    async def broadcast_to_users(self, user_ids: list[int], event: str, data: Any):
        """Отправить событие нескольким пользователям (например, подписчикам)"""
        for uid in user_ids:
            await self.send_to_user(uid, event, data)
    
    async def broadcast_all(self, event: str, data: Any):
        """Отправить событие ВСЕМ подключённым пользователям"""
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, event, data)

    async def broadcast_to_chat(self, chat_id: int, event: str, data: Any, session):
        """Отправить событие ВСЕМ участникам чата"""
        from models import ChatMember
        members = session.exec(
            select(ChatMember).where(ChatMember.chat_id == chat_id)
        ).all()
        for member in members:
            await self.send_to_user(member.user_id, event, data)


    @property
    def total_connections(self) -> int:
        return sum(len(conns) for conns in self.active_connections.values())

    def get_online_user_ids(self) -> set[int]:
        """Список ID пользователей, которые сейчас онлайн"""
        return set(self.active_connections.keys())


# Глобальный singleton — доступен из любого модуля
manager = ConnectionManager()