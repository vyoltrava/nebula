// lib/appUpdate.ts — система обновлений APK через GitHub Releases.
// Публикация: релиз на GitHub с APK-ассетом (например app-release.apk);
// версия — тег релиза (v1.2.3). Приложение проверяет свежесть и предлагает скачать.
'use client';

export interface ApkUpdateInfo {
  available: boolean;
  latestVersion: string;
  currentVersion: string;
  apkUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

const REPO = process.env.NEXT_PUBLIC_GITHUB_APK_REPO || '';
const ASSET_NAME = process.env.NEXT_PUBLIC_APK_ASSET_NAME || 'app-release.apk';
const CURRENT_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

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
 * Проверить обновление APK через GitHub Releases (последний релиз).
 * NEXT_PUBLIC_GITHUB_APK_REPO, напр. "vyoltrava/trelod-app".
 */
export async function checkApkUpdate(): Promise<ApkUpdateInfo> {
  const empty: ApkUpdateInfo = {
    available: false, latestVersion: '', currentVersion: CURRENT_APP_VERSION,
    apkUrl: null, releaseNotes: null, publishedAt: null,
  };
  if (!REPO) return empty;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' }
    );
    if (!res.ok) return empty;
    const rel = await res.json();
    const latestVersion: string = rel.tag_name || '';
    const asset = (rel.assets || []).find((a: any) =>
      a.name === ASSET_NAME || a.name.endsWith('.apk'));
    const available =
      !!asset && compareVersions(latestVersion, CURRENT_APP_VERSION) > 0;
    return {
      available,
      latestVersion: latestVersion.replace(/^v/, ''),
      currentVersion: CURRENT_APP_VERSION,
      apkUrl: asset?.browser_download_url || null,
      releaseNotes: rel.body || null,
      publishedAt: rel.published_at || null,
    };
  } catch {
    return empty;
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

/** Открыть скачивание APK (стандартный sideload: браузер качает → юзер ставит). */
export function openApkDownload(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener');
}
