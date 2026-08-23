# ============================================================
# app/routers/realtime.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Принимаем соединение ПЕРЕД любыми действиями
    await websocket.accept()
    
    # 2. Достаём токен из query-параметров
    token = websocket.query_params.get("token")
    
    # 3. Аутентификация через JWT
    user_id = None
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return
    
    if not user_id:
        await websocket.close(code=4001, reason="Not authenticated")
        return
    
    # 4. Проверяем пользователя в БД
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user or user.is_banned:
            await websocket.close(code=4003, reason="Banned or not found")
            return
    
    # 5. Подключаем к менеджеру
    await manager.connect(websocket, user_id)
    
    # 6. ✅ ОБНОВЛЯЕМ last_seen БЕЗ блокировки event loop
    await run_in_threadpool(_update_last_seen_sync, user_id)
    
    try:
        # 7. Держим соединение открытым
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"❌ WS error for user {user_id}: {e}")
        await manager.disconnect(websocket, user_id)

