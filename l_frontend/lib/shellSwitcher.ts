"use client";

/**
 * 🎛️ Глобальный флаг «смены оболочек» (Zune / Old iOS).
 *
 * Источник истины — сервер (SystemSetting: shell_switcher_enabled),
 * на клиенте значение кэшируется в localStorage, чтобы анти-FOUC скрипты
 * в layout.tsx могли ещё до первой отрисовки решить: применять оболочку
 * или сбросить пользователя в классику.
 *
 * Пока флаг выключен (темы в разработке):
 *   - переключатели оболочек в настройках не рендерятся;
 *   - у всех пользователей принудительно классическая тема.
 *
 * Управление: админка → Компоненты → Темы.
 */

export const SHELL_SWITCHER_CACHE_KEY = "shell-switcher-enabled";
export const SHELL_SWITCHER_EVENT = "shell-switcher-changed";

/** Кэшированное на клиенте состояние флага (до первого ответа сервера — off) */
export function getCachedShellSwitcherEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHELL_SWITCHER_CACHE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCachedShellSwitcherEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SHELL_SWITCHER_CACHE_KEY, enabled ? "1" : "0");
  } catch {
    /* приватный режим — переживём без кэша */
  }
}

function dispatchShellSwitcherChanged(enabled: boolean): void {
  window.dispatchEvent(
    new CustomEvent(SHELL_SWITCHER_EVENT, { detail: { enabled } })
  );
}

/**
 * Синхронизация с сервером: обновляет кэш и оповещает подписчиков
 * (провайдеры тем, админка). Возвращает актуальное состояние флага.
 */
export async function syncShellSwitcherFlag(): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/settings/shell-switcher`
    );
    if (res.ok) {
      const data = await res.json();
      const enabled = Boolean(data?.enabled);
      setCachedShellSwitcherEnabled(enabled);
      dispatchShellSwitcherChanged(enabled);
      return enabled;
    }
  } catch {
    /* сервер недоступен — работаем по кэшу */
  }
  return getCachedShellSwitcherEnabled();
}