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
  error?: string;
}

interface AppUpdateBridgeResult {
  ok?: boolean;
  message?: string;
  error?: string;
}

export interface DesktopUpdateEvent {
  available?: boolean;
  latestVersion?: string;
  currentVersion?: string;
  installerUrl?: string | null;
}

export interface AppRuntimeWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      AppUpdate?: {
        getVersion?: () => Promise<{ version?: string }>;
        downloadAndInstall?: (options: { url: string }) => Promise<AppUpdateBridgeResult>;
      };
    };
  };
  trelodDesktop?: {
    isDesktop?: boolean;
    getVersion?: () => Promise<string>;
    downloadAndInstall?: (url: string) => Promise<AppUpdateBridgeResult>;
    onUpdateAvailable?: (callback: (info: DesktopUpdateEvent) => void) => () => void;
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Путь к манифесту обновлений в зависимости от платформы. */
function updateManifestPath(): string {
  return isDesktopApp() ? '/desktop/update.json' : '/apk/update.json';
}

/** Нативное приложение Capacitor (Android APK / iOS)? */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as AppRuntimeWindow).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** Нативное десктоп-приложение (Electron, мост trelodDesktop)? */
export function isDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(window as AppRuntimeWindow).trelodDesktop?.isDesktop;
  } catch {
    return false;
  }
}

/** Whether this native app has a bridge that can check and install APK updates. */
export function supportsNativeUpdate(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as AppRuntimeWindow).Capacitor;
  return !!(
    cap?.isNativePlatform?.() &&
    typeof cap.Plugins?.AppUpdate?.getVersion === 'function' &&
    typeof cap.Plugins?.AppUpdate?.downloadAndInstall === 'function'
  );
}

/** PWA-режим (standalone): iOS Home Screen / установленный Web-бандл. */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true; // iOS
    return window.matchMedia('(display-mode: standalone)').matches; // Android/десктоп
  } catch {
    return false;
  }
}

/** Стоит показывать автообновление: нативный APK, Desktop или PWA. */
export function shouldCheckUpdates(): boolean {
  return supportsNativeUpdate() || isDesktopApp() || isPwaStandalone();
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
 * Проверить обновление нативного APK или десктоп-приложения.
 */
export async function checkApkUpdate(): Promise<ApkUpdateInfo> {
  const empty: ApkUpdateInfo = {
    available: false, latestVersion: '', currentVersion: '', apkUrl: null,
  };
  if (!isNativeApp() && !isDesktopApp()) return empty;

  // Read the installed native app version before comparing it with the platform manifest.
  let currentVersion: string;
  try {
    const { trelodDesktop: desk, Capacitor: cap } = window as AppRuntimeWindow;
    if (desk?.isDesktop) {
      if (typeof desk.getVersion !== 'function') throw new Error('Desktop version API is unavailable');
      currentVersion = await desk.getVersion();
    } else if (cap?.isNativePlatform?.() && typeof cap.Plugins?.AppUpdate?.getVersion === 'function') {
      const r = await cap.Plugins.AppUpdate.getVersion();
      if (!r?.version) throw new Error('Could not read the installed app version');
      currentVersion = r.version;
    } else {
      return { ...empty, error: 'Native update plugin is unavailable' };
    }
    if (!currentVersion) throw new Error('Could not read the installed app version');
  } catch (error: unknown) {
    return { ...empty, error: getErrorMessage(error) };
  }

  // Свежая версия — из манифеста обновлений, задеплоенного с фронтом
  try {
    const res = await fetch(updateManifestPath(), { cache: 'no-store' });
    if (!res.ok) return { ...empty, currentVersion, error: `Update manifest request failed (${res.status})` };
    const meta: unknown = await res.json();
    if (
      typeof meta !== 'object' ||
      meta === null ||
      !('version' in meta) ||
      !('url' in meta) ||
      (typeof meta.version !== 'string' && typeof meta.version !== 'number') ||
      typeof meta.url !== 'string'
    ) {
      return { ...empty, currentVersion, error: 'Update manifest is invalid' };
    }

    const apkUrl = new URL(meta.url, window.location.origin).href;
    const available = compareVersions(String(meta.version), currentVersion) > 0;
    return {
      available,
      latestVersion: String(meta.version),
      currentVersion,
      apkUrl,
    };
  } catch (error: unknown) {
    return { ...empty, currentVersion, error: getErrorMessage(error) };
  }
}

/** Force a Service Worker update check and report whether it installed a newer worker. */
export async function checkPwaUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service Worker is not supported');
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('Service Worker is not registered');

  const activeBefore = registration.active;
  let foundWorker: ServiceWorker | null = null;
  const onUpdateFound = () => { foundWorker = registration.installing; };
  registration.addEventListener('updatefound', onUpdateFound);

  try {
    await registration.update();
    const worker = registration.installing || registration.waiting || foundWorker;
    if (worker && worker.state !== 'installed' && worker.state !== 'activated') {
      await new Promise<void>((resolve, reject) => {
        const onStateChange = () => {
          if (worker.state === 'installed' || worker.state === 'activated') {
            window.clearTimeout(timeout);
            worker.removeEventListener('statechange', onStateChange);
            resolve();
          } else if (worker.state === 'redundant') {
            window.clearTimeout(timeout);
            worker.removeEventListener('statechange', onStateChange);
            reject(new Error('The update could not be installed'));
          }
        };
        const timeout = window.setTimeout(() => {
          worker.removeEventListener('statechange', onStateChange);
          reject(new Error('Timed out while installing the update'));
        }, 30_000);
        worker.addEventListener('statechange', onStateChange);
        onStateChange();
      });
    }
    return !!registration.waiting || (!!activeBefore && !!registration.active && registration.active !== activeBefore);
  } finally {
    registration.removeEventListener('updatefound', onUpdateFound);
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
    const { trelodDesktop: desk, Capacitor: cap } = window as AppRuntimeWindow;
    if (desk?.isDesktop) {
      if (typeof desk.downloadAndInstall !== 'function') throw new Error('Desktop update API is unavailable');
      const res = await desk.downloadAndInstall(url);
      return { ok: !!res?.ok, message: res?.message, error: res?.error };
    }
    if (cap?.isNativePlatform?.() && typeof cap.Plugins?.AppUpdate?.downloadAndInstall === 'function') {
      const res = await cap.Plugins.AppUpdate.downloadAndInstall({ url });
      return { ok: !!res?.ok, message: res?.message };
    }
  } catch (error: unknown) {
    return { ok: false, error: getErrorMessage(error) };
  }
  window.open(url, '_blank', 'noopener');
  return { ok: true, message: 'Открыта ссылка на скачивание' };
}

/** Apply an already checked PWA update and reload after the new worker takes control. */
export async function applyPwaUpdate(): Promise<void> {
  const serviceWorker = navigator.serviceWorker;
  const registration = await serviceWorker?.getRegistration();
  const waiting = registration?.waiting;
  const controllerBefore = serviceWorker?.controller;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });

  const activationPending = !!(
    controllerBefore &&
    (waiting || (registration?.active && registration.active !== controllerBefore))
  );
  if (activationPending) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        serviceWorker.removeEventListener('controllerchange', finish);
        resolve();
      };
      const timeout = window.setTimeout(finish, 10_000);
      serviceWorker.addEventListener('controllerchange', finish, { once: true });
      if (serviceWorker.controller !== controllerBefore) finish();
    });
  }
  window.location.reload();
}

/** Открыть скачивание APK (стандартный sideload: браузер качает → юзер ставит). */
export function openApkDownload(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener');
}
