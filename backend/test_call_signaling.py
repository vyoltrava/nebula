"""
Интеграционный тест signaling звонка (эмуляция фронтенда WebSocketProvider/useWebRTC).

Полный happy-path:
  A -> call_initiate            -> B получает call_incoming, A получает call_initiated
  B -> call_accept              -> A получает call_accepted
  A -> call_offer (SDP)         -> B получает call_offer
  B -> call_answer (SDP)        -> A получает call_answer
  A/B -> call_ice_candidate x2  -> доставляются обеим сторонам
  B -> call_reject/call_end     -> доставляется
"""
import asyncio, json, sys
import websockets

BASE = "ws://127.0.0.1:8001/ws?token={}"
STEP_TIMEOUT = 5

results = []

def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("PASS" if cond else "FAIL"), name, extra)

async def wait_event(ws, name, timeout=STEP_TIMEOUT):
    """Ждём событие {event, data} с указанным именем, пропуская ping/pong."""
    while True:
        raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        if raw in ("ping", "pong"):
            continue
        msg = json.loads(raw)
        ev = msg.get("event")
        if ev == name:
            return msg.get("data", {})
        # другое событие — пропускаем, но логируем
        print(f"  (skip unexpected event: {ev})")

async def register(token):
    ws = await websockets.connect(BASE.format(token), open_timeout=10)
    await ws.send("ping")
    raw = await asyncio.wait_for(ws.recv(), timeout=STEP_TIMEOUT)
    if raw != "pong":
        msg = json.loads(raw)
        assert msg.get("event") == "pong", f"keep-alive broken: {raw!r}"
    return ws

async def main():
    pass

async def run():
    import httpx
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8001") as c:
        # Регистрируем двух тестовых пользователей
        creds = []
        ids = []
        for i, username in enumerate(["calla", "callb"]):
            reg = await c.post("/api/register", json={
                "username": username, "display_name": username, "password": "TestPass123!",
            })
            print(f"register {username}: {reg.status_code} {reg.text[:100]}")
            r = await c.post("/api/login", json={"username": username, "password": "TestPass123!"})
            check(f"login user {'A' if i == 0 else 'B'}", r.status_code == 200, r.text[:120])
            body = r.json()
            tok = body.get("access_token") or body.get("token")
            creds.append(tok)
            me = await c.get("/api/me", headers={"Authorization": f"Bearer {tok}"})
            ids.append(me.json().get("id") if me.status_code == 200 else None)
    print("user ids:", ids)
    tokA, tokB = creds
    idA, idB = ids
    if not (idA and idB):
        print("cannot resolve user ids — aborting")
        sys.exit(2)

    wsA = await register(tokA)
    wsB = await register(tokB)
    print("both sockets connected")

    # --- A инициирует звонок ---
    await wsA.send(json.dumps({
        "type": "call_initiate", "target_user_id": idB, "call_type": "audio",
        "caller_name": "calla", "caller_avatar": "",
    }))
    inc = await wait_event(wsB, "call_incoming")
    check("B: call_incoming", inc.get("call_id", "").startswith("call-"), json.dumps(inc)[:120])
    check("B: call_incoming.caller_id == idA", inc.get("caller_id") == idA)
    call_id = inc["call_id"]

    initd = await wait_event(wsA, "call_initiated")
    check("A: call_initiated (same call_id)", initd.get("call_id") == call_id, json.dumps(initd)[:120])

    # --- B принимает ---
    await wsB.send(json.dumps({"type": "call_accept", "call_id": call_id, "target_user_id": idA}))
    acc = await wait_event(wsA, "call_accepted")
    check("A: call_accepted", acc.get("call_id") == call_id, json.dumps(acc)[:120])

    # --- A отправляет offer ---
    offer = {"type": "sdp-offer", "sdp": "v=0 fake-offer-line\r\n"}
    await wsA.send(json.dumps({"type": "call_offer", "call_id": call_id, "target_user_id": idB, "sdp": offer}))
    got_offer = await wait_event(wsB, "call_offer")
    check("B: call_offer relayed", got_offer.get("sdp", {}).get("sdp") == offer["sdp"], json.dumps(got_offer)[:120])

    # --- B отвечает answer ---
    answer = {"type": "sdp-answer", "sdp": "v=0 fake-answer-line\r\n"}
    await wsB.send(json.dumps({"type": "call_answer", "call_id": call_id, "target_user_id": idA, "sdp": answer}))
    got_answer = await wait_event(wsA, "call_answer")
    check("A: call_answer relayed", got_answer.get("sdp", {}).get("sdp") == answer["sdp"], json.dumps(got_answer)[:120])

    # --- ICE-кандидаты в обе стороны ---
    await wsA.send(json.dumps({"type": "call_ice_candidate", "call_id": call_id, "target_user_id": idB,
                               "candidate": {"candidate": "candidate:1 1 UDP 100 host", "sdpMid": "0"}}))
    got_ice_b = await wait_event(wsB, "call_ice_candidate")
    check("B: ICE from A relayed", got_ice_b.get("candidate", {}).get("candidate", "").startswith("candidate:1"), json.dumps(got_ice_b)[:120])

    await wsB.send(json.dumps({"type": "call_ice_candidate", "call_id": call_id, "target_user_id": idA,
                               "candidate": {"candidate": "candidate:2 1 UDP 100 host", "sdpMid": "0"}}))
    got_ice_a = await wait_event(wsA, "call_ice_candidate")
    check("A: ICE from B relayed", got_ice_a.get("candidate", {}).get("candidate", "").startswith("candidate:2"), json.dumps(got_ice_a)[:120])

    # --- B завершает ---
    await wsB.send(json.dumps({"type": "call_end", "call_id": call_id, "target_user_id": idA}))
    ended = await wait_event(wsA, "call_ended")
    check("A: call_ended relayed", ended.get("call_id") == call_id, json.dumps(ended)[:120])

    await wsA.close(); await wsB.close()

asyncio.run(run())

failed = [r for r in results if not r[1]]
print(f"\n=== {len(results) - len(failed)}/{len(results)} passed ===")
sys.exit(1 if failed else 0)
