"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { socket } from "./websocket";
import { apiFetch } from "./api";
import { API_URL } from "./api";
import { getToken } from "./auth";

interface UnreadCounts {
  chats: number;
  notifications: number;
}

interface UnreadCountsContextType {
  counts: UnreadCounts;
  refresh: () => Promise<void>;
}

const UnreadCountsContext = createContext<UnreadCountsContextType>({
  counts: { chats: 0, notifications: 0 },
  refresh: async () => {},
});

export function UnreadCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<UnreadCounts>({ chats: 0, notifications: 0 });

  const refresh = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await apiFetch(`${API_URL}/api/counts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCounts({
          chats: data.chats_unread || 0,
          notifications: data.notifications_unread || 0,
        });
      }
    } catch (e) {
      console.error("Failed to fetch counts:", e);
    }
  };

  useEffect(() => {
    // Первичная загрузка
    refresh();

    // Подписка на WebSocket-события
    const unsubNewMessage = socket.on("new_message", () => {
      refresh();
    });

    const unsubNewNotification = socket.on("new_notification", () => {
      refresh();
    });

    const unsubMessageRead = socket.on("message_read", () => {
      refresh();
    });

    const unsubNotificationRead = socket.on("notification_read", () => {
      refresh();
    });

    return () => {
      unsubNewMessage();
      unsubNewNotification();
      unsubMessageRead();
      unsubNotificationRead();
    };
  }, []);

  return (
    <UnreadCountsContext.Provider value={{ counts, refresh }}>
      {children}
    </UnreadCountsContext.Provider>
  );
}

export function useUnreadCounts() {
  return useContext(UnreadCountsContext);
}