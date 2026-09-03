// components/AppUpdateChecker.tsx — автообновление APK. Стилистика как в Telegram:
// цельный bottom-баннер с blur-подложкой, не перекрывает контент, аккуратные кнопки.
'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import {
  checkApkUpdate, isNativeApp, isPwaStandalone, shouldCheckUpdates,
  installUpdate, applyPwaUpdate, ApkUpdateInfo,
} from '@/lib/appUpdate';

const DISMISS_PREFIX = 'apk_update_dismissed_';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 часов

export function AppUpdateChecker() {
  const [update, setUpdate] = useState<ApkUpdateInfo | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isPwa, setIsPwa] = useState(false);

  useEffect(() => {
    if (!shouldCheckUpdates()) return; // обычная вкладка браузера — SW сам обновится

    setIsPwa(!isNativeApp() && isPwaStandalone());

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
    if (isPwa) {
      // PWA (вкл. iOS Home Screen): обновление = новый фронт, применяем через SW
      setStatus('Применяю обновление…');
      await applyPwaUpdate(); // внутри — reload страницы
      return;
    }
    setStatus('Скачиваю обновление…');
    const res = await installUpdate(update.apkUrl);
    setStatus(res.ok ? (res.message || 'Готово — подтверди установку в диалоге Android.') : `Ошибка: ${res.error}`);
    setBusy(false);
  };

  return (
    <>
      {/* 🔥 blur-подложка — затемняет фон и фокусирует на баннере */}
      <div className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm" onClick={dismiss} />

      {/* Цельный bottom-баннер в стиле приложения (как сущ. обновления в ТГ) */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-white/95 dark:bg-[#1c1c1f]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* цветная шапка */}
          <div className="h-1 bg-gradient-to-r from-[#8b5cf6] via-[#a78bfa] to-[#8b5cf6]" />
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-11 h-11 rounded-xl bg-[#8b5cf6]/15 flex items-center justify-center">
                {busy ? (
                  <RefreshCw size={20} className="text-[#8b5cf6] animate-spin" />
                ) : (
                  <ArrowUpCircle size={20} className="text-[#8b5cf6]" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900 dark:text-white text-[15px]">
                    Обновление приложения
                  </h3>
                  <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#8b5cf6]/15 text-[#8b5cf6]">
                    v{update.latestVersion}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
                  {isPwa
                    ? 'Установите новую версию сайта — обновление применится сразу.'
                    : `Доступна новая версия. Текущая: v${update.currentVersion}`}
                </p>
                {status && (
                  <p className="text-xs text-[#8b5cf6] mt-2">{status}</p>
                )}
              </div>

              <button
                onClick={dismiss}
                aria-label="Закрыть"
                className="shrink-0 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                <X size={16} className="text-gray-400 dark:text-white/40" />
              </button>
            </div>

            <div className="mt-3.5 flex gap-2.5">
              <button
                onClick={doUpdate}
                disabled={busy}
                className="flex-1 sm:flex-none sm:px-6 py-2.5 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {busy ? 'Обновляю…' : 'Обновить сейчас'}
              </button>
              <button
                onClick={dismiss}
                className="flex-1 sm:flex-none sm:px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 text-sm font-medium transition-colors active:scale-[0.98]"
              >
                Позже
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
