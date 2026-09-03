// lib/pwaIcons.ts — смена иконки приложения (как в Telegram).
// Иконки — отдельная кастомизация: набор картинок, не привязанный к темам.
// Список: config/app-icons.json; файлы: public/pwa/icons/<id>/.
// Манифест отдаётся динамически: /api/pwa/manifest/<id> (сам видит, какие файлы есть).
'use client';

import iconsConfig from '@/config/app-icons.json';

export interface AppIcon {
  id: string;
  name: string;
}

export const APP_ICONS: AppIcon[] = iconsConfig;

const STORAGE_KEY = 'pwa_icon_theme';
export const DEFAULT_ICON = 'standart';

/** Минимальный уровень пользователя, с которого доступна смена иконки. */
export const ICON_MIN_LEVEL = 2;

export function getIconId(): string {
  if (typeof window === 'undefined') return DEFAULT_ICON;
  const stored = localStorage.getItem(STORAGE_KEY) ?? '';
  return APP_ICONS.some((i) => i.id === stored) ? stored : DEFAULT_ICON;
}

function setLinkHref(rel: string, href: string): void {
  const links = document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (links.length > 0) {
    links.forEach((l) => {
      l.href = rel === 'apple-touch-icon' ? `${href}?t=${Date.now()}` : href;
    });
  }
}

/** Применить иконку: favicon + apple-touch-icon + манифест. */
export function applyAppIcon(iconId: string): void {
  if (typeof document === 'undefined') return;
  if (iconId === DEFAULT_ICON) {
    // Стандартная — корневые файлы как есть (не трогаем)
    setLinkHref('icon', '/pwa/favicon-32.png');
    setLinkHref('apple-touch-icon', '/apple-touch-icon.png');
    setLinkHref('manifest', '/manifest.json');
    return;
  }
  const dir = `/pwa/icons/${iconId}`;
  setLinkHref('icon', `${dir}/favicon-32.png`);
  setLinkHref('apple-touch-icon', `${dir}/apple-touch-icon.png`);
  setLinkHref('manifest', `/api/pwa/manifest/${iconId}`);
}

/** Установить и сохранить иконку (вызов из настроек). */
export function setAppIcon(iconId: string): void {
  if (!APP_ICONS.some((i) => i.id === iconId)) return;
  localStorage.setItem(STORAGE_KEY, iconId);
  applyAppIcon(iconId);
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

