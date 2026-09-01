import { getToken, clearToken, refreshAccessToken } from "@/lib/auth";

export interface ApiFetchOptions extends RequestInit {
  /** skip auto-refresh on 401 (use for non-auth endpoints) */
  skipAuthRefresh?: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * fetch-обёртка с авто refresh access-токена при 401.
 * Используйте для всех защищённых запросов в админке и статистике.
 */
export async function apiFetch(
  input: string,
  init?: ApiFetchOptions
): Promise<Response> {
  const { skipAuthRefresh = false, ...rest } = init || {};
  const url = input.startsWith("http") ? input : `${API_URL}${input}`;

  const doFetch = (token: string | null) =>
    fetch(url, {
      ...rest,
      credentials: "include", // httpOnly refresh-cookie уходит с запросом автоматически
      headers: {
        ...(rest.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let token = getToken();
  let res = await doFetch(token);

    if (!res.ok && res.status === 401 && !skipAuthRefresh) {
    const { token: newToken, unreachable } = await refreshAccessToken();
    if (newToken) {
      token = newToken;
      res = await doFetch(token);
    }
    // 🔥 Если refresh провален — НЕ удаляем аккаунт! Просто возвращаем исходный
    // 401. Вызывающий код (AuthProvider/AuthGuard) сам решает, удалять или нет.
    // Раньше clearToken() удалял аккаунт при любом 401 — это ломало мультиаккаунт.
    // unreachable === true (сеть недоступна): тоже не трогаем аккаунт.
  }

  return res;
}
