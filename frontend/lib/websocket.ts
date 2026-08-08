type EventHandler = (data: any) => void;

class NebulaSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    // Определяем WS URL из API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    this.url = apiUrl.replace(/^http/, "ws") + "/ws";
  }

  connect(token: string) {
    // 🛡️ Защита от двойного подключения
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

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

      this.ws.onclose = () => {
        console.log("⚡ WS disconnected");
        this.stopPing();
        this.scheduleReconnect(token);
      };

      this.ws.onerror = (err) => {
        console.error("⚡ WS error:", err);
      };
    } catch (e) {
      console.error("⚡ WS connect failed:", e);
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 30000); // пинг каждые 30 секунд
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(token: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    this.reconnectTimeout = setTimeout(() => {
      console.log(`⚡ Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect(token);
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // не переподключаться
  }

  // Подписка на события
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // Возвращаем функцию отписки
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

// Singleton
export const socket = new NebulaSocket();