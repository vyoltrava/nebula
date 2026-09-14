// lib/qr.ts — QR-утилиты: ссылка на профиль, вход по QR (create/swap), разбор скан-результата.
'use client';

export function getProfileUrl(username?: string): string {
  if (typeof window === 'undefined') return '';
  const base = window.location.origin;
  return username ? `${base}/${username}` : base;
}

/** Создать QR входа (POST /api/qr-login/create). Требует авторизацию. */
export async function createLoginQr(): Promise<{ qrUrl: string; expiresIn: number; error?: string }> {
  try {
    const { getToken } = await import('@/lib/auth');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/qr-login/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { qrUrl: '', expiresIn: 0, error: d.detail || 'Не удалось создать QR входа' };
    }
    const data = await res.json();
    return { qrUrl: data.qr_url, expiresIn: data.expires_in };
  } catch (e: any) {
    return { qrUrl: '', expiresIn: 0, error: e?.message || 'Сетевая ошибка' };
  }
}

/** Обменять код из QR на сессию (POST /api/qr-login/swap). */
export async function swapLoginQr(code: string): Promise<{ ok: boolean; token?: string; refreshToken?: string; user?: any; error?: string }> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/qr-login/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, error: d.detail || 'Код недействителен' };
    }
    const data = await res.json();
    return { ok: true, token: data.token, refreshToken: data.refresh_token, user: data.user };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Сетевая ошибка' };
  }
}

/** Зарезервированные корневые пути, которые НЕ считаем профилем. */
const RESERVED = ['settings', 'messages', 'login', 'nebula-settings', 'nebula-profile', 'notifications', 'nebula-user'];

/**
 * Разобрать отсканированный текст:
 *  - QR входа: /login?action=qrauth&code=… → /login?action=qrauth&code=…
 *  - профиль:  origin/<username> (один сегмент) → /<username>
 * Возвращает href или null, если ничего не распознано.
 */
export function resolveScanned(text: string): { href: string } | null {
  if (!text) return null;
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  // QR входа
  const loginMatch = text.match(/\/login\?action=qrauth&code=([A-Za-z0-9_\-]+)/);
  if (loginMatch) return { href: `/login?action=qrauth&code=${loginMatch[1]}` };
  // Профиль: base/<username>
  if (base && text.startsWith(base + '/')) {
    const rest = text.slice(base.length + 1);
    if (rest && !rest.includes('/') && !RESERVED.includes(rest)) {
      return { href: `/${rest}` };
    }
  }
  // Абсолютная http(s) ссылка куда угодно — в ту же вкладку
  if (/^https?:\/\//.test(text)) return { href: text };
  return null;
}
