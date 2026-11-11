"use client";
import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { registerServiceWorker, requestPeriodicSync, updateServiceWorker } from "@/lib/pwa/register";
import { applyPwaUpdate } from "@/lib/appUpdate";

/**
 * Регистрирует Service Worker и показывает баннер обновления,
 * когда выходит новая версия приложения. Безопасен для браузеров
 * без поддержки Service Worker (feature detection внутри).
 */
export default function PWARegister() {
  const { t } = useI18n();
  const [updateReady, setUpdateReady] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  useEffect(() => {
    let disposed = false;

    registerServiceWorker({
      swUrl: "/sw.js",
      onState: (state) => {
        if (disposed) return;
        if (state === "error") {
          // Не роняем приложение: просто логируем.
          console.warn("[PWA] SW недоступен, продолжаем без офлайн-режима.");
        }
      },
      onUpdate: () => {
        if (disposed) return;
        setUpdateReady(true);
      },
    })
      // Периодическая фоновая синхронизация — только там, где доступна.
      .then(() => requestPeriodicSync(60).catch(() => {}));

    const checkForUpdates = () => {
      if (document.visibilityState === "visible") {
        void updateServiceWorker();
      }
    };
    const updateTimer = window.setInterval(() => void updateServiceWorker(), 30 * 60 * 1000);
    window.addEventListener("focus", checkForUpdates);
    document.addEventListener("visibilitychange", checkForUpdates);

    return () => {
      disposed = true;
      window.clearInterval(updateTimer);
      window.removeEventListener("focus", checkForUpdates);
      document.removeEventListener("visibilitychange", checkForUpdates);
    };
  }, []);

  const applyUpdate = useCallback(async () => {
    setUpdateError(false);
    try {
      await applyPwaUpdate();
    } catch (error) {
      console.error("[PWA] Не удалось применить обновление:", error);
      setUpdateError(true);
    }
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
        {updateError ? t("download.updateFailed") : t("pwa.updateAvailable")}
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