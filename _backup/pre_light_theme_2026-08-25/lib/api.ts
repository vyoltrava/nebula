export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
import { perfFetch } from "./perf";
import { getToken } from '@/lib/auth';


export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = getToken();
  
  // Мержим headers: не трогаем существующие, добавляем Authorization если есть токен
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return perfFetch(url, {
    ...options,
    headers,
  });
}

// ============================================================
// 📌 ЗАКРЕПЛЕНИЯ (ДОБАВИТЬ В КОНЕЦ ФАЙЛА)
// ============================================================

export async function pinMessage(chatId: number, messageId: number): Promise<void> {
  const token = localStorage.getItem('token');
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
  const token = localStorage.getItem('token');
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
  const token = localStorage.getItem('token');
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

