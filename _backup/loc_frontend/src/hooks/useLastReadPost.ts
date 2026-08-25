import { useEffect, useState, useCallback } from "react";
import { getToken } from "@/lib/auth";

export interface LastReadPost {
  post_id: number;
  text_preview: string;
  author_name: string;
  author_avatar: string | null;
  saved_at: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function useLastReadPost() {
  const [post, setPost] = useState<LastReadPost | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) { setPost(null); return; }
    try {
      const res = await fetch(`${API_URL}/api/me/last-read`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const newPost = data.has_post ? data : null;
        setPost(newPost);
      }
    } catch (e) {
      console.error('[LastRead] refresh error:', e);
    }
  }, []);

  const save = useCallback(async (postId: number) => {
    const token = getToken();
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/me/last-read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      });
      // Перезагружаем данные с сервера, чтобы Sidebar обновился
      await refresh();
      window.dispatchEvent(new CustomEvent("last-read-saved"));
    } catch (e) {
      console.error('[LastRead] save error:', e);
    }
  }, [refresh]);

  const clear = useCallback(async () => {
    const token = getToken();
    setPost(null); // Оптимистичное обновление — убираем сразу
    if (!token) return;
    try {
      await fetch(`${API_URL}/api/me/last-read`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      window.dispatchEvent(new CustomEvent("last-read-cleared"));
    } catch (e) {
      console.error('[LastRead] clear error:', e);
    }
  }, []);

  useEffect(() => {
    const onSaved = () => refresh();
    const onCleared = () => setPost(null);
    window.addEventListener("last-read-saved", onSaved);
    window.addEventListener("last-read-cleared", onCleared);
    refresh();
    return () => {
      window.removeEventListener("last-read-saved", onSaved);
      window.removeEventListener("last-read-cleared", onCleared);
    };
  }, [refresh]);

  return { post, save, clear, refresh };
}