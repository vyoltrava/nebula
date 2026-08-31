/**
 * 🍪 Cookie Manager — лёгкая утилита работы с куками (без зависимостей).
 *
 * Реальные токены НЕ хранятся в JS-доступных куках (XSS-безопасность):
 *  - refresh_token — httpOnly cookie на домене API (path=/api/auth);
 *  - access_token  — httpOnly cookie на домене API (path=/);
 * Здесь лежит только легковесная подсказка для синхронной проверки
 * авторизации на клиенте И на сервере (Next middleware) — `nebula_auth_hint`
 * (id активного аккаунта). Подделка подсказки не даёт доступа: все API-запросы
 * всё равно требуют валидный Bearer-токен / refresh-cookie.
 */

export interface CookieOptions {
  days?: number;
  path?: string;
  /** "lax" (по умолчанию) | "strict" | "none" (нужен secure) */
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
}

const isProd = () =>
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

export const AUTH_HINT_COOKIE = "nebula_auth_hint";

export function setCookie(name: string, value: string, options: CookieOptions = {}): void {
  if (typeof document === "undefined") return;
  try {
    const {
      days = 7,
      path = "/",
      sameSite = "lax",
      secure = isProd(),
    } = options;
    const expires = new Date(Date.now() + days * 86400_000).toUTCString();
    const parts = [
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
      `expires=${expires}`,
      `path=${path}`,
      `samesite=${sameSite}`,
    ];
    if (secure) parts.push("secure");
    document.cookie = parts.join("; ");
  } catch {
    /* приватный режим / заблокированные куки — не критично */
  }
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const prefix = `${encodeURIComponent(name)}=`;
    for (const chunk of document.cookie.split(";")) {
      const trimmed = chunk.trim();
      if (trimmed.startsWith(prefix)) {
        const raw = trimmed.slice(prefix.length);
        try {
          return decodeURIComponent(raw);
        } catch {
          return raw; // кука повреждена — отдаём как есть, не роняем приложение
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function deleteCookie(name: string, path: string = "/"): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
  } catch {
    /* ignore */
  }
}

export function getAllCookies(): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof document === "undefined") return out;
  for (const chunk of document.cookie.split(";")) {
    const idx = chunk.indexOf("=");
    if (idx < 1) continue;
    const k = chunk.slice(0, idx).trim();
    const v = chunk.slice(idx + 1).trim();
    try {
      out[decodeURIComponent(k)] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** Синхронная проверка «есть ли сессия» (по подсказке-хуку или легаси-токену). */
export function isAuthenticated(): boolean {
  return Boolean(getCookie(AUTH_HINT_COOKIE));
}

/** Подсказка для middleware/SSR: id активного аккаунта или null. */
export function getAuthHint(): number | null {
  const raw = getCookie(AUTH_HINT_COOKIE);
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function setAuthHint(userId: number): void {
  setCookie(AUTH_HINT_COOKIE, String(userId), { days: 7 });
}

export function clearAuthHint(): void {
  deleteCookie(AUTH_HINT_COOKIE);
}

/** Токены из кук (access/refresh — httpOnly на API-домене, JS их не видит). */
export function getAuthTokens(): { accessToken: string | null; refreshToken: string | null } {
  // httpOnly куки недоступны из document.cookie — это осознанное решение.
  // Access-токен фронт берёт из localStorage (lib/auth), refresh шлётся браузером
  // автоматически на /api/auth/*. Функция оставлена для совместимости/диагностики.
  return { accessToken: null, refreshToken: null };
}