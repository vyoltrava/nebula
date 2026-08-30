'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/LanguageProvider';

// Типизация для события установки PWA (Chrome/Edge/Android)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** iOS: Safari не даёт события beforeinstallprompt, только ручная установка. */
const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Разрешаем передвижение/показ только когда пользователь уже был на странице
const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [iosShow, setIosShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // уже установлено — кнопка не нужна

    if (isIOS()) {
      // iOS: показываем кастомную подсказку, но не чаще 1 раза в 2 недели
      const last = localStorage.getItem('pwa-ios-asked');
      if (!last || Date.now() - Number(last) > 14 * 24 * 3600 * 1000) {
        const t1 = setTimeout(() => setIosShow(true), 2000);
        return () => clearTimeout(t1);
      }
      return;
    }

    const handler = (e: Event) => {
      // Перехватываем нативный попап установки, показываем свою кнопку.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
    };
    const onAppInstalled = () => {
      setShowButton(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    // Вызываем нативное окно установки браузера
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowButton(false);
      setDeferredPrompt(null);
    }
  };

  const dismissIos = () => {
    setIosShow(false);
    try { localStorage.setItem('pwa-ios-asked', String(Date.now())); } catch {}
  };

  // Кнопка установки (Chrome/Edge/Android)
  if (showButton) {
    return (
      <button
        onClick={handleInstall}
        className="fixed bottom-20 right-5 z-50 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-xl transition-all hover:bg-indigo-700 active:scale-95"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {t("pwa.install")}
      </button>
    );
  }

  // iOS: кастомная подсказка с шагами
  if (iosShow) {
    return (
      <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
        <div className="w-full max-w-sm rounded-2xl border border-indigo-500/30 bg-[#17171f] p-5 text-white shadow-2xl">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-lg font-bold">{t("pwa.install")}</h3>
            <button onClick={dismissIos} aria-label="close" className="text-gray-400 hover:text-white">✕</button>
          </div>
          <p className="text-sm text-gray-300">
            Откройте меню <b>«Поделиться»</b> в Safari и выберите <b>«На экран
            «Домой»»</b> / “Add to Home Screen”.
          </p>
          <button
            onClick={dismissIos}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold hover:bg-indigo-500"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return null;
}