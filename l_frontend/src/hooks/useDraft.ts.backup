"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Мгновенное сохранение текста в localStorage (первично, работает офлайн)
 * + синхронизация с сервером/БД (для черновиков чатов и поста).
 * Ключи: draft_chat_{id} → серверный ключ "{id}", draft_create_post → "post".
 * Если сеть недоступна — текст остаётся в localStorage, PUT повторится
 * при появлении сети (событие online) или при следующем вводе.
 */

// Серверный ключ для localStorage-ключа (или null — не синхронизировать)
function serverKeyOf(key: string): string | null {
  if (key.startsWith("draft_chat_")) return key.slice("draft_chat_".length) || null;
  if (key === "draft_create_post") return "post";
  return null;
}

// ── Офлайн-очередь: незалитые PUT повторяются при возврате сети ──
const PENDING_KEY = "drafts_pending_sync";
function pendingAdd(serverKey: string) {
  try {
    const set = new Set<string>(JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"));
    set.add(serverKey);
    localStorage.setItem(PENDING_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}
function pendingRemove(serverKey: string) {
  try {
    const set = new Set<string>(JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"));
    set.delete(serverKey);
    localStorage.setItem(PENDING_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}
async function flushPending() {
  const token = getToken();
  if (!token || typeof window === "undefined") return;
  let list: string[] = [];
  try { list = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]"); } catch { return; }
  for (const sk of list) {
    const localKey = sk === "post" ? "draft_create_post" : `draft_chat_${sk}`;
    const text = localStorage.getItem(localKey);
    try {
      const res = await fetch(`${API}/api/chat-drafts/${encodeURIComponent(sk)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: text || "" }),
      });
      if (res.ok) pendingRemove(sk);
    } catch { /* сеть недоступна — попробуем в следующий раз */ }
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("online", flushPending);
  window.addEventListener("drafts-flush", flushPending as EventListener);
}

export function useDraft(key: string, initialValue: string = "") {
  const serverKey = serverKeyOf(key);
  const [value, setValue] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(key);
      return saved !== null ? saved : initialValue;
    }
    return initialValue;
  });

  // подтянуть черновик из БД, если локально пусто (другое устройство/чистый браузер)
  useEffect(() => {
    if (!serverKey) return;
    const saved = localStorage.getItem(key);
    if (saved && saved.trim()) return;
    const token = getToken();
    if (!token) return;
    let alive = true;
    fetch(`${API}/api/chat-drafts/${encodeURIComponent(serverKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d && d.text) {
          localStorage.setItem(key, d.text);
          setValue(d.text);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, serverKey]);

  // дебаунс-сохранение на сервер (localStorage пишется всегда — см. эффект ниже)
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!serverKey || typeof window === "undefined") return;
    const token = getToken();
    if (!token) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      fetch(`${API}/api/chat-drafts/${encodeURIComponent(serverKey)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text: value }),
      })
        .then((r) => { if (r.ok) pendingRemove(serverKey); else pendingAdd(serverKey); })
        .catch(() => {
          // сеть упала — ставим в очередь на повтор
          pendingAdd(serverKey);
        });
    }, 1000);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [value, serverKey]);

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
      if (serverKey) {
        pendingRemove(serverKey);
        const token = getToken();
        if (token)
          fetch(`${API}/api/chat-drafts/${encodeURIComponent(serverKey)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
      }
    }
  }, [key, serverKey]);

  return [value, setValue, clear] as const;
}