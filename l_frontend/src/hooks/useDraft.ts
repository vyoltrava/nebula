"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Мгновенное сохранение текста в localStorage + сервер (для черновиков чатов).
 * Текст сохраняется прямо при вводе, переживает перезагрузку страницы
 * и синхронизируется между устройствами через БД (ключи вида draft_chat_{id}).
 */
export function useDraft(key: string, initialValue: string = "") {
  const isChatDraft = key.startsWith("draft_chat_");
  const chatId = isChatDraft ? key.slice("draft_chat_".length) : null;
  const [value, setValue] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(key);
      return saved !== null ? saved : initialValue;
    }
    return initialValue;
  });

  // подтянуть черновик из БД, если локально пусто (другое устройство)
  useEffect(() => {
    if (!chatId) return;
    const saved = localStorage.getItem(key);
    if (saved && saved.trim()) return;
    const token = getToken();
    if (!token) return;
    fetch(`${API}/api/chat-drafts/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.text) {
          localStorage.setItem(key, d.text);
          setValue(d.text);
        }
      })
      .catch(() => {});
  }, [key, chatId]);

  // дебаунс-сохранение на сервер
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!chatId || typeof window === "undefined") return;
    const token = getToken();
    if (!token) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch(`${API}/api/chat-drafts/${chatId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: value }),
      }).catch(() => {});
    }, 1000);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [value, chatId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
      // уведомить другие компоненты (список чатов) об изменении черновика
      window.dispatchEvent(new Event("drafts-changed"));
    }
  }, [key, value]);

  const clear = useCallback(() => {
    setValue("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
      if (chatId) {
        const token = getToken();
        if (token)
          fetch(`${API}/api/chat-drafts/${chatId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
      }
    }
  }, [key, chatId]);

  return [value, setValue, clear] as const;
}