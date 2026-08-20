"use client";
import { useEffect } from "react";
import { socket } from "@/lib/websocket";
import { getToken } from "@/lib/auth";
import { showBackgroundNotification } from "@/lib/notifications";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = getToken();
    if (token) {
      socket.connect(token);
    }

    // 🔥 1. Новое сообщение в чате (DM или группа)
    const unsubMessage = socket.on("new_message", (data: any) => {
      if (document.hidden) {
        showBackgroundNotification({
          title: `💬 ${data.sender_name || "Новое сообщение"}`,
          body: data.media_type
            ? `📎 ${data.media_type === "image" ? "Фото" : data.media_type === "audio" ? "Голосовое" : data.media_type}`
            : (data.text || "🔒 Секретное сообщение"),
          icon: data.sender_avatar || undefined,
          tag: `chat-${data.chat_id}`, // Группируем уведомления по чату
          url: `/messages/${data.chat_id}`, // ← Исправлено: используем url вместо data
        });
      }
    });

    // 🔥 2. Новый пост
    const unsubPost = socket.on("new_post", (data: any) => {
      if (document.hidden) {
        showBackgroundNotification({
          title: `✨ ${data.author} (@${data.handle})`,
          body: data.text ? data.text.slice(0, 100) : (data.media_url ? "📷 Медиа" : "Новый пост"),
          tag: `post-${data.id}`,
          url: `/post/${data.id}`, // ← Исправлено
        });
      }
    });

    // 🔥 3. Новое обновление от фаундера
    const unsubUpdate = socket.on("new_update", (data: any) => {
      // Обновления показываем даже если вкладка активна? 
      // Если нет — добавь if (document.hidden)
      showBackgroundNotification({
        title: `📢 Обновление: ${data.title}`,
        body: data.importance === "major" ? "🔥 Важное обновление!" : "Незначительное обновление",
        tag: `update-${data.id}`,
        url: "/updates", // ← Исправлено
      });
    });

    return () => {
      unsubMessage();
      unsubPost();
      unsubUpdate();
      socket.disconnect();
    };
  }, []);

  return <>{children}</>;
}