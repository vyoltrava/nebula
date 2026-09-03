// loc_frontend/lib/websocket.ts

type EventHandler = (data: any) => void;

class NebulaSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true;
  
  // 🔥 ОЧЕРЕДЬ СООБЩЕНИЙ: Сюда кладем данные, если сокет закрыт
  private messageQueue: any[] = [];

  // 🔥 ПОСЛЕДНИЙ ТОКЕН: нужен для восстановления связи после чистого закрытия
  // сервером (деплой Render/scale) и для переподключения из send(), когда
  // сигнал (offer/answer/ICE) понадобилось отправить, а сокет уже мёртв.
  private lastToken: string | null = null;

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    this.url = apiUrl.replace(/^http/, "ws") + "/ws";
  }

  connect(token: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // 🔥 Запоминаем токен для восстановления после чистого закрытия сервером
    this.lastToken = token;
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(`${this.url}?token=${token}`);

      this.ws.onopen = () => {
        console.log(" WS connected");
        this.reconnectAttempts = 0;
        this.startPing();
        
        // 🔥 ОТПРАВЛЯЕМ ВСЕ НАКОПЛЕННЫЕ СООБЩЕНИЯ ИЗ ОЧЕРЕДИ
        this.flushQueue();
      };

      this.ws.onmessage = (event) => {
          if (event.data === "pong" || event.data === "ping") return;
        console.log("📥 [WS FRONTEND] RAW сообщение от сервера:", event.data);
        
        try {
          const msg = JSON.parse(event.data);
          console.log("📥 [WS FRONTEND] Распарсенное событие:", msg.event, msg.data);
          this.emit(msg.event, msg.data);
        } catch (e) {
          console.error("WS parse error:", e);
        }
      };

      this.ws.onclose = (event) => {
        console.log("⚡ WS disconnected", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        this.stopPing();

        if (event.code === 4001 || event.code === 4003 || event.code === 1008) {
          console.error("⚡ WS auth failed, stopping reconnect");
          this.shouldReconnect = false;
          return;
        }

        if (event.wasClean && event.code === 1000) {
          console.log("⚡ WS closed cleanly");
          // Явный socket.disconnect() всегда сначала выставляет
          // shouldReconnect=false, поэтому сюда с shouldReconnect=true мы
          // попадаем только при СЕРВЕРНОМ чистом закрытии (деплой Render,
          // scale-down) или обрыве транспорта, который браузер оформил как
          // чистый. Раньше здесь просто возвращались — и сокет умирал до тех
          // пор, пока не отправлялось новое сообщение. Восстанавливаем связь.
          if (this.shouldReconnect && this.lastToken) {
            this.scheduleReconnect(this.lastToken);
            return;
          }
          return;
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect(token);
        }
      };

      this.ws.onerror = (err) => {
        console.error("⚡ WS error:", err);
      };
    } catch (e) {
      console.error("⚡ WS connect failed:", e);
      if (this.shouldReconnect) {
        this.scheduleReconnect(token);
      }
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 5000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(token: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("⚡ Max reconnect attempts reached");
      return;
    }
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    this.reconnectTimeout = setTimeout(() => {
      console.log(`⚡ Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect(token);
    }, delay);
  }

  // 🔥 ОЖИВЛЕНИЕ СОКЕТА (критично для iOS):
  // iOS Safari/WKWebView подвешивает WebSocket при блокировке экрана и
  // сворачивании приложения. После возврата сокет мёртв, и входящие звонки
  // (call_incoming) не доходят. Вызывайте этот метод при возврате во
  // вкладку/приложение — он восстановит соединение без перезагрузки страницы.
  ensureAlive() {
    const dead =
      !this.ws ||
      this.ws.readyState === WebSocket.CLOSED ||
      this.ws.readyState === WebSocket.CLOSING;
    if (dead && this.lastToken && this.shouldReconnect && this.reconnectTimeout === null) {
      this.reconnectAttempts = 0;
      this.scheduleReconnect(this.lastToken);
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.messageQueue = []; // Очищаем очередь при явном отключении
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      // 🔥 ЕСЛИ СОКЕТ ЗАКРЫТ - КЛАДЕМ В ОЧЕРЕДЬ
      console.warn("⚡ WS не подключен, добавляю в очередь:", data.type || 'unknown');
      this.messageQueue.push(data);

      // 🔥 Если сокет мёртв и переподключение ещё не запланировано —
      // запускаем его сами. Раньше сообщение просто лежало в очереди,
      // пока кто-то другой не вызовет connect(), и сигналы звонка
      // (offer/answer/ICE) терялись.
      const dead = !this.ws || this.ws.readyState === WebSocket.CLOSED;
      if (dead && this.lastToken && this.reconnectTimeout === null) {
        console.log(" Попытка восстановить соединение для отправки очереди...");
        this.scheduleReconnect(this.lastToken);
      }
    }
  }

  // 🔥 МЕТОД ОТПРАВКИ ОЧЕРЕДИ
  private flushQueue() {
    if (this.ws?.readyState === WebSocket.OPEN && this.messageQueue.length > 0) {
      console.log(` Отправляю ${this.messageQueue.length} отложенных сообщений из очереди`);
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift();
        try {
          this.ws!.send(JSON.stringify(msg));
        } catch (e) {
          console.error("Ошибка отправки из очереди:", e);
          // Если ошибка, возвращаем сообщение в начало очереди
          this.messageQueue.unshift(msg);
          break;
        }
      }
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler) {
    this.handlers.get(event)?.delete(handler);
  }

  private emit(event: string, data: any) {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error("WS handler error:", e);
      }
    });
  }
}

export const socket = new NebulaSocket();