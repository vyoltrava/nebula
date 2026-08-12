// frontend/components/NotificationPermissionPrompt.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionStatus,
} from "@/lib/notifications";

/** Ключ в localStorage чтобы не показывать баннер повторно */
const STORAGE_KEY = "notification-prompt-dismissed";

export function NotificationPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<NotificationPermissionStatus>("default");
  const [loading, setLoading] = useState(false);

  // Проверяем нужно ли показать баннер
  useEffect(() => {
    const permission = getNotificationPermission();
    setStatus(permission);

    // Не показываем если:
    // - уже разрешено
    // - уже отказано (бесполезно просить)
    // - браузер не поддерживает
    // - пользователь уже закрыл баннер
    if (permission !== "default") return;

    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      if (dismissed) return;
    } catch {
      // localStorage недоступен (SSR, приватный режим)
    }

    // Показать через 5 секунд, чтобы не мешать при загрузке
    const timer = setTimeout(() => {
      setVisible(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Закрыть баннер
  const dismiss = useCallback(() => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  // Разрешить
  const handleAllow = useCallback(async () => {
    setLoading(true);
    const result = await requestNotificationPermission();
    setStatus(result);
    setLoading(false);
    setVisible(false);

    // Запоминаем что пользователь ответил
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-full mx-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 animate-in slide-in-from-bottom-4 duration-300">
        {/* Кнопка закрыть */}
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Закрыть"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-3">
          {/* Иконка колокольчика */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Включить уведомления?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Получайте уведомления о новых сообщениях, даже когда вкладка свёрнута.
            </p>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAllow}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Запрашиваем..." : "Разрешить"}
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Не сейчас
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}