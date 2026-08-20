'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/LanguageProvider';

// Типизация для события установки PWA
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Браузер хочет показать свой стандартный попап установки.
      // Мы его перехватываем, чтобы показать свою красивую кнопку.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowButton(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Вызываем нативное окно установки браузера
    await deferredPrompt.prompt();

    // Ждем, что выберет юзер
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      // Если юзер согласился, прячем кнопку
      setShowButton(false);
      setDeferredPrompt(null);
    }
  };

  if (!showButton) return null;

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white shadow-xl transition-all hover:bg-indigo-700 active:scale-95"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {t("pwa.install")}
    </button>
  );
}