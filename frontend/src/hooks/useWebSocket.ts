import { useEffect } from "react";
import { socket } from "@/lib/websocket";

/**
 * Хук для подписки на WebSocket события.
 * Автоматически отписывается при размонтировании компонента.
 */
export function useWebSocket(event: string, handler: (data: any) => void) {
  useEffect(() => {
    const unsubscribe = socket.on(event, handler);
    return unsubscribe;
  }, [event, handler]);
}