// lib/qr.ts — QR-утилиты: ссылка на профиль, QR-вход (request/poll/confirm), разбор скан-результата.
// Схема входа: ЛОГИН-окно показывает QR (request) и опрашивает poll;
// АККАУНТ (уже залогинен) сканирует QR сканером и подтверждает (confirm).
'use client';

import type { MessageKey } from "@/lib/i18n";

export function getProfileUrl(username?: string): string {
  if (typeof window === 'undefined') return '';
  const base = window.location.origin;
  return username ? `${base}/${username}` : base;
}

export interface QRLoginRequest {
  code: string;
  qrUrl: string;
  expiresIn: number;
  /** Текст ошибки с сервера (если был). */
  error?: string;
  /** Ключ локализации ошибки — UI показывает t(errorKey). */
  errorKey?: MessageKey;
}

/** Логин-окно: создать QR входа (публичный эндпоинт, без авторизации). */
export async function requestLoginQr(): Promise<QRLoginRequest> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/qr-login/request`, {
      method: 'POST',
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { code: '', qrUrl: '', expiresIn: 0, error: d.detail, errorKey: 'qr.createFailed' };
    }
    const data = await res.json();
    return { code: data.code, qrUrl: data.qr_url, expiresIn: data.expires_in };
  } catch (e: any) {
    return { code: '', qrUrl: '', expiresIn: 0, error: e?.message, errorKey: 'qr.networkError' };
  }
}

export interface QRLoginPoll {
  status: 'pending' | 'approved' | 'expired';
  token?: string;
  refreshToken?: string;
  user?: any;
  error?: string;
  errorKey?: MessageKey;
}

/** Логин-окно: опрос статуса QR. approved → сессия выдана. */
export async function pollLoginQr(code: string): Promise<QRLoginPoll> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/qr-login/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { status: 'expired', error: d.detail, errorKey: 'qr.pollError' };
    }
    const data = await res.json();
    return {
      status: data.status,
      token: data.token,
      refreshToken: data.refresh_token,
      user: data.user,
    };
  } catch (e: any) {
    // сетевой сбой — считаем «ещё ждём», не роняем поток
    return { status: 'pending', error: e?.message, errorKey: 'qr.networkError' };
  }
}

export interface QRConfirmResult {
  ok: boolean;
  user?: { id: number; username: string; display_name: string };
  error?: string;
  errorKey?: MessageKey;
}

/** Аккаунт: подтвердить вход по отсканированному QR (нужна авторизация). */
export async function confirmLoginQr(code: string): Promise<QRConfirmResult> {
  try {
    const { getToken } = await import('@/lib/auth');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/qr-login/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return { ok: false, error: d.detail, errorKey: 'qr.confirmFailed' };
    }
    const data = await res.json();
    return { ok: true, user: data.user };
  } catch (e: any) {
    return { ok: false, error: e?.message, errorKey: 'qr.networkError' };
  }
}

/** Зарезервированные корневые пути, которые НЕ считаем профилем. */
const RESERVED = ['settings', 'messages', 'login', 'nebula-settings', 'nebula-profile', 'notifications', 'nebula-user'];

export type ScanResult =
  | { kind: 'qrconfirm'; code: string }
  | { kind: 'link'; href: string }
  | null;

/**
 * Разобрать отсканированный текст:
 *  - QR-вход: /login?action=qrconfirm&code=… → подтвердить вход (со сканера аккаунта)
 *  - профиль: origin/<username> → перейти
 */
export function resolveScanned(text: string): ScanResult {
  if (!text) return null;
  // QR-вход (подтверждение с аккаунта)
  const m = text.match(/\/login\?action=qrconfirm&code=([A-Za-z0-9_\-]+)/);
  if (m) return { kind: 'qrconfirm', code: m[1] };
  // Профиль: base/<username>
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  if (base && text.startsWith(base + '/')) {
    const rest = text.slice(base.length + 1);
    if (rest && !rest.includes('/') && !RESERVED.includes(rest)) {
      return { kind: 'link', href: `/${rest}` };
    }
  }
  // Абсолютная http(s) ссылка куда угодно — в ту же вкладку
  if (/^https?:\/\//.test(text)) return { kind: 'link', href: text };
  return null;
}
