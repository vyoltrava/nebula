"use client";
import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { registerServiceWorker, requestPeriodicSync } from "@/lib/pwa/register";

/**
 * Регистрирует Service Worker и показывает баннер обновления,
 * когда выходит новая версия приложения. Безопасен для браузеров
 * без поддержки Service Worker (feature detection внутри).
 */
export default function PWARegister() {
  const { t } = useI18n();
  const [updateReady, setUpdateReady] = useState(false);
  const [swState, setSwState] = useState<string>("idle");

  useEffect(() => {
    let disposed = false;

    registerServiceWorker({
      swUrl: "/sw.js",
      onState: (state) => {
        if (disposed) return;
        setSwState(state);
        if (state === "error") {
          // Не роняем приложение: просто логируем.
          console.warn("[PWA] SW недоступен, продолжаем без офлайн-режима.");
        }
      },
      onUpdate: (registration) => {
        if (disposed) return;
        // Есть новая версия — показываем баннер.
        setUpdateReady(true);
        // Запоминаем воркера для принудительного skipWaiting при подтверждении.
        window.__nebulaWaitingSW = registration.waiting || registration.installing || null;
      },
    })
      // Периодическая фоновая синхронизация — только там, где доступна.
      .then(() => requestPeriodicSync(60).catch(() => {}));

    return () => {
      disposed = true;
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    // Просим waiting-воркера активироваться и перезагружаемся.
    const waiting = window.__nebulaWaitingSW;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      navigator.serviceWorker?.controller?.postMessage({ type: "SKIP_WAITING" });
    }
    // Дождёмся, когда новый SW возьмёт контроль, затем перезагрузим.
    navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => {});
    setTimeout(() => window.location.reload(), 400);
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-[60] flex w-[min(92vw,26rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-500/30 bg-[#14142a]/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-lg font-black text-white">
        N
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">
        {t("pwa.updateAvailable")}
      </p>
      <button
        onClick={applyUpdate}
        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 active:scale-95"
      >
        {t("pwa.updateNow")}
      </button>
      <button
        onClick={() => setUpdateReady(false)}
        aria-label={t("pwa.updateLater")}
        className="shrink-0 rounded-lg px-2 py-2 text-xs font-medium text-gray-400 transition hover:text-white"
      >
        {t("pwa.updateLater")}
      </button>
    </div>
  );
}

// Тип для хранения waiting-воркера (глобально, чтобы пережить ререндеры).
declare global {
  interface Window {
    __nebulaWaitingSW: ServiceWorker | null;
  }
}