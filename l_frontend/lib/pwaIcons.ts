// lib/pwaIcons.ts — смена иконки приложения (как в Telegram).
// Иконки — отдельная кастомизация: набор картинок, не привязанный к темам.
// Список: config/app-icons.json; файлы: public/pwa/icons/<id>/.
// Манифест отдаётся динамически: /api/pwa/manifest/<id> (сам видит, какие файлы есть).
'use client';

import iconsConfig from '@/config/app-icons.json';
import { getCachedUser } from '@/lib/authCache';
import { getUserLevel } from '@/lib/auth';

export interface AppIcon {
  id: string;
  name: string;
}

export const APP_ICONS: AppIcon[] = iconsConfig;

const STORAGE_KEY = 'pwa_icon_theme';
export const DEFAULT_ICON = 'standart';

/** Минимальный уровень пользователя, с которого доступна смена иконки. */
export const ICON_MIN_LEVEL = 2;

/** iPhone / iPad / iPod (для iOS-специфичных подсказок). */
export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document);
}

export function getIconId(): string {
  if (typeof window === 'undefined') return DEFAULT_ICON;
  const stored = localStorage.getItem(STORAGE_KEY) ?? '';
  return APP_ICONS.some((i) => i.id === stored) ? stored : DEFAULT_ICON;
}

function setLinkHref(rel: string, href: string, bust = false): void {
  const links = document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (links.length > 0) {
    links.forEach((l) => {
      // Бастинг версией — форсирует перекачку вместо закэшленной картинки
      l.href = bust ? `${href}?v=${Date.now()}` : href;
    });
  }
}

/** Применить иконку: favicon + apple-touch-icon + манифест. */
export function applyAppIcon(iconId: string): void {
  if (typeof document === 'undefined') return;
  if (iconId === DEFAULT_ICON) {
    // Стандартная — корневые файлы как есть (не трогаем), но бастим для PWA
    setLinkHref('icon', '/pwa/favicon-32.png', true);
    setLinkHref('apple-touch-icon', '/apple-touch-icon.png', true);
    setLinkHref('manifest', '/manifest.json', true);
    return;
  }
  const dir = `/pwa/icons/${iconId}`;
  setLinkHref('icon', `${dir}/favicon-32.png`, true);
  setLinkHref('apple-touch-icon', `${dir}/apple-touch-icon.png`, true);
  setLinkHref('manifest', `/api/pwa/manifest/${iconId}`, true);
}

/** Заставляет service worker и браузер перекачать ресурсы (инвалидация). */
async function bustCache(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
    // Принудительный fetch новых иконок — заполнит кэш актуальными версиями
    const ids = ['favicon-32.png', 'apple-touch-icon.png'];
    ids.forEach((f) => fetch(`/pwa/${f}?v=${Date.now()}`).catch(() => {}));
  } catch { /* light */ }
}

/** Установить и сохранить иконку (вызов из настроек). Только с 2 уровня. */
export async function setAppIcon(iconId: string): Promise<void> {
  if (!APP_ICONS.some((i) => i.id === iconId)) return;
  // 🔥 Дубль-страховка: смена иконки доступна только с уровня ICON_MIN_LEVEL
  if (getUserLevel(getCachedUser()) < ICON_MIN_LEVEL) return;
  localStorage.setItem(STORAGE_KEY, iconId);
  applyAppIcon(iconId);
  await bustCache();
  // В нативном APK дополнительно меняем лаунчер-иконку через нативный плагин
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() && cap.Plugins?.AppIcon) {
      cap.Plugins.AppIcon.setIcon({ alias: iconId });
    }
  } catch { /* не нативное окружение — игнор */ }
}

/** Применить сохранённую иконку при загрузке приложения. */
export function initAppIcon(): void {
  applyAppIcon(getIconId());
}

