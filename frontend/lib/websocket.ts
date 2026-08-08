type EventHandler = (data: any) => void;

class NebulaSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private shouldReconnect = true; // 🔥 Флаг для остановки реконнекта при критических ошибках

  constructor() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    this.url = apiUrl.replace(/^http/, "ws") + "/ws";
  }

  connect(token: string) {
    // 🛡️ Защита от двойного подключения
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // 🔥 Сбрасываем флаг при каждой попытке подключения
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(`${this.url}?token=${token}`);

      this.ws.onopen = () => {
        console.log("⚡ WS connected");
        this.reconnectAttempts = 0;
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
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

        // 🔥 НЕ переподключаемся при критических ошибках аутентификации
        if (event.code === 4001 || event.code === 4003 || event.code === 1008) {
          console.error("⚡ WS auth failed, stopping reconnect");
          this.shouldReconnect = false;
          return;
        }

        // 🔥 Не переподключаемся, если соединение было закрыто чисто (logout)
        if (event.wasClean && event.code === 1000) {
          console.log("⚡ WS closed cleanly");
          return;
        }

        if (this.shouldReconnect) {
          this.scheduleReconnect(token);
        }
      };

      this.ws.onerror = (err) => {
        console.error("⚡ WS error:", err);
        // 🔥 Браузер сам вызовет onclose после onerror, но мы логируем для дебага
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
    }, 20000); // 🔥 20 секунд (безопаснее для Render)
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

  disconnect() {
    this.shouldReconnect = false; // 🔥 Останавливаем реконнект
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.reconnectAttempts = 0; // 🔥 Сбрасываем счетчик
  }

  // Подписка на события
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