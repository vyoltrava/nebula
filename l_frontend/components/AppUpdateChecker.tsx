// components/AppUpdateChecker.tsx — проверка обновлений APK (только в нативном приложении)
'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { checkApkUpdate, isNativeApp, installUpdate, ApkUpdateInfo } from '@/lib/appUpdate';

const DISMISS_PREFIX = 'apk_update_dismissed_';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 часов

export function AppUpdateChecker() {
  const [update, setUpdate] = useState<ApkUpdateInfo | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return; // в браузере/PWA обновления идут через Service Worker

    let timer: ReturnType<typeof setInterval> | null = null;
    const run = async () => {
      const info = await checkApkUpdate();
      if (info.available && info.apkUrl) {
        const dismissed = localStorage.getItem(DISMISS_PREFIX + info.latestVersion);
        if (!dismissed) {
          setUpdate(info);
          setHidden(false);
        }
      }
    };
    run();
    timer = setInterval(run, CHECK_INTERVAL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  if (!update || hidden) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_PREFIX + update.latestVersion, '1');
    setHidden(true);
  };

  const doUpdate = async () => {
    if (!update.apkUrl) return;
    setBusy(true);
    setStatus('Скачиваю обновление…');
    const res = await installUpdate(update.apkUrl);
    setStatus(res.ok ? (res.message || 'Готово — подтверди установку в диалоге Android.') : `Ошибка: ${res.error}`);
    setBusy(false);
  };

  return (
    <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:w-96 z-[10000]">
      <div className="rounded-2xl bg-[#8b5cf6] text-white shadow-2xl p-4 flex items-start gap-3">
        <Download size={22} className="shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">Доступно обновление trelod v{update.latestVersion}</p>
          <p className="text-xs text-white/70 mt-0.5">
            Текущая версия: {update.currentVersion}
          </p>
          <button
            onClick={doUpdate}
            disabled={busy}
            className="mt-2.5 w-full sm:w-auto px-4 py-2 rounded-xl bg-white text-[#8b5cf6] text-sm font-bold active:scale-95 transition-transform disabled:opacity-60"
          >
            {busy ? 'Обновляю…' : 'Обновить сейчас'}
          </button>
          {status && <p className="text-[11px] text-white/80 mt-2">{status}</p>}
        </div>
        <button onClick={dismiss} aria-label="Закрыть" className="shrink-0 p-1 rounded-full hover:bg-white/15">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
