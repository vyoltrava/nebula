// lib/appUpdate.ts — автообновление нативного приложения: APK (Android, Capacitor)
// и Desktop (Windows, Electron). Проверка простая: приложение спрашивает у нативного
// слоя свою версию и сравнивает её с update.json, задеплоенным вместе с фронтом
// (/apk/update.json для APK, /desktop/update.json для десктоп-установщика).
// Выпуск обновления: mobile/release…→ release-apk.mjs, desktop → release-desktop.mjs.
'use client';

export interface ApkUpdateInfo {
  available: boolean;
  latestVersion: string;
  currentVersion: string;
  apkUrl: string | null;
}

/** Путь к манифесту обновлений в зависимости от платформы. */
function updateManifestPath(): string {
  return isDesktopApp() ? '/desktop/update.json' : '/apk/update.json';
}

/** Нативное приложение Capacitor (Android APK / iOS)? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** Нативное десктоп-приложение (Electron, мост trelodDesktop)? */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(window as any).trelodDesktop?.isDesktop;
  } catch {
    return false;
  }
}

/** PWA-режим (standalone): iOS Home Screen / установленный Web-бандл. */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const nav = window.navigator as any;
    if (nav.standalone === true) return true; // iOS
    return window.matchMedia('(display-mode: standalone)').matches; // Android/десктоп
  } catch {
    return false;
  }
}

/** Стоит показывать автообновление: нативный APK, Desktop или PWA. */
export function shouldCheckUpdates(): boolean {
  return isNativeApp() || isDesktopApp() || isPwaStandalone();
}

/** Сравнение версий вида 1.2.3: -1 / 0 / 1 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Проверить обновление: версия APK (нативно) или «0» в PWA vs /apk/update.json.
 */
export async function checkApkUpdate(): Promise<ApkUpdateInfo> {
  const empty: ApkUpdateInfo = {
    available: false, latestVersion: '', currentVersion: '', apkUrl: null,
  };
  if (!shouldCheckUpdates()) return empty;

  // Своя установленная версия:
  //  - нативный APK — из плагина
  //  - PWA (iOS/Android standalone) — плагина нет, считаем за самую свежую цель;
  //    реальная версия не известна, потому при выдаче нового релиза update.json
  //    всегда новее → баннер покажем.
  let currentVersion = '0';
  try {
    const desk = (window as any).trelodDesktop;
    const cap = (window as any).Capacitor;
    if (desk?.isDesktop) {
      // Desktop (Electron): версия из нативного слоя.
      currentVersion = (await desk.getVersion()) || '0';
    } else if (cap?.isNativePlatform?.() && cap.Plugins?.AppUpdate) {
      // Нативный APK (Capacitor).
      const r = await cap.Plugins.AppUpdate.getVersion();
      currentVersion = r?.version || '0';
    }
  } catch {
    // плагин/мост недоступен — PWA, оставляем '0'
  }

  // Свежая версия — из манифеста обновлений, задеплоенного с фронтом
  try {
    const res = await fetch(updateManifestPath(), { cache: 'no-store' });
    if (!res.ok) return { ...empty, currentVersion };
    const meta = await res.json();
    if (!meta?.version || !meta?.url) return { ...empty, currentVersion };

    const apkUrl = new URL(meta.url, window.location.origin).href;
    const available = compareVersions(String(meta.version), currentVersion) > 0;
    return {
      available,
      latestVersion: String(meta.version),
      currentVersion,
      apkUrl,
    };
  } catch {
    return { ...empty, currentVersion };
  }
}

/**
 * Установка обновления:
 *  - в Desktop (Electron): качает установщик и запускает его (тихо)
 *  - в нативном APK: качает APK и запускает системный установщик Android
 *  - в браузере: открывает ссылку в новой вкладке
 */
export async function installUpdate(url: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'no window' };
  try {
    const desk = (window as any).trelodDesktop;
    const cap = (window as any).Capacitor;
    if (desk?.isDesktop) {
      // Desktop (Electron): установщик скачивается и запускается в главном процессе.
      const res = await desk.downloadAndInstall(url);
      return { ok: !!res?.ok, message: res?.message, error: res?.error };
    }
    if (cap?.isNativePlatform?.() && cap.Plugins?.AppUpdate) {
      // Нативный APK: системный установщик Android.
      const res = await cap.Plugins.AppUpdate.downloadAndInstall({ url });
      return { ok: !!res?.ok, message: res?.message };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
  window.open(url, '_blank', 'noopener');
  return { ok: true, message: 'Открыта ссылка на скачивание' };
}

/**
 * Применить обновление в PWA: просим SW перекачаться и перезагружаем страницу —
 * новый фронт (а он и есть «обновление» для PWA) встаёт сразу.
 */
export async function applyPwaUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update();
      // даём новому SW время установиться и взять управление
      await new Promise((r) => setTimeout(r, 800));
    }
  } catch { /*SW нет — просто перезагрузка*/ }
  window.location.reload();
}

/** Открыть скачивание APK (стандартный sideload: браузер качает → юзер ставит). */
export function openApkDownload(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener');
}
