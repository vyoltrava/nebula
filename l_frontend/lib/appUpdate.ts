// lib/appUpdate.ts — автообновление APK прямо из приложения.
// Проверка простая: приложение спрашивает у нативного плагина свою версию
// и сравнивает её с /apk/update.json (деплоится вместе с фронтом).
// Выпуск обновления: собрал APK → node scripts/release-apk.mjs <версия> → git push.
'use client';

export interface ApkUpdateInfo {
  available: boolean;
  latestVersion: string;
  currentVersion: string;
  apkUrl: string | null;
}

const UPDATE_MANIFEST = '/apk/update.json';

/** Нативное приложение Capacitor? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as any).Capacitor;
    return !!cap?.isNativePlatform?.();
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

/** Стоит показывать автообновление: нативный APK или PWA. */
export function shouldCheckUpdates(): boolean {
  return isNativeApp() || isPwaStandalone();
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
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() && cap.Plugins?.AppUpdate) {
      const r = await cap.Plugins.AppUpdate.getVersion();
      currentVersion = r?.version || '0';
    }
  } catch {
    // плагин недоступен — PWA, оставляем '0'
  }

  // Свежая версия — из манифеста обновлений, задеплоенного с фронтом
  try {
    const res = await fetch(UPDATE_MANIFEST, { cache: 'no-store' });
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
 *  - в нативном APK: качает APK и запускает системный установщик (без браузера)
 *  - в браузере: открывает ссылку в новой вкладке
 */
export async function installUpdate(url: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  if (typeof window === 'undefined') return { ok: false, error: 'no window' };
  try {
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.() && cap.Plugins?.AppUpdate) {
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
