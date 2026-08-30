export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
import { perfFetch } from "./perf";
import { getToken } from '@/lib/auth';
import { queueable } from "@/lib/pwa/syncQueue";


export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();

  // Мержим headers: не трогаем существующие, добавляем Authorization если есть токен
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Мутации помечаем как «ставимые в очередь» — SW при офлайне сложит их,
  // а при восстановлении сети отправит через фоновую синхронизацию.
  const method = (options.method || "GET").toUpperCase();

  return perfFetch(url, queueable({
    ...options,
    headers,
    method,
  }));
}

// ============================================================
// 📌 ЗАКРЕПЛЕНИЯ
// 🐞 FIX: раньше здесь читался легаси-ключ localStorage.getItem('token').
//    В приложении мультиаккаунт (AccountSwitcher), и в этом ключе мог
//    лежать токен ДРУГОГО аккаунта → сервер отвечал 403 «Вы не участник
//    чата», хотя пользователь находится в чате. Теперь используем
//    getToken() — токен именно АКТИВНОГО аккаунта (как и весь остальной
//    код приложения).
// ============================================================

export async function pinMessage(chatId: number, messageId: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${messageId}/pin`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Failed to pin message');
  }
}

export async function unpinMessage(chatId: number, messageId: number): Promise<void> {
  const token = getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages/${messageId}/unpin`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Failed to unpin message');
  }
}

export async function getPinnedMessages(chatId: number): Promise<any[]> {
  const token = getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/pinned`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Failed to get pinned messages');
  }
  return res.json();
}


// ============================================================
// 📌 ЗАКРЕПЛЕНИЕ ЧАТОВ (ДО 5 ШТУК)
// ============================================================

export async function pinChat(chatId: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Не авторизован");
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Не удалось закрепить чат');
  }
}

export async function unpinChat(chatId: number): Promise<void> {
  const token = getToken();
  if (!token) throw new Error("Не авторизован");
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/pin`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Не удалось открепить чат');
  }
}

