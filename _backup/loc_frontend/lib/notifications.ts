// frontend/lib/notifications.ts

/**
 * Утилита для системных уведомлений через Notification API.
 * Показывает уведомление ТОЛЬКО когда вкладка не в фокусе.
 * Если вкладка активна — возвращает false (показывай in-app toast).
 */

const DEFAULT_ICON = "/logo-icon.svg";

/** Текущий статус разрешения */
export type NotificationPermissionStatus =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

/**
 * Получить текущий статус разрешения на уведомления.
 * Безопасно вызывать на сервере (вернёт "unsupported").
 */
export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/**
 * Запросить разрешение на уведомления.
 * ⚠️ Вызывать ТОЛЬКО по действию пользователя (клик по кнопке),
 * иначе браузер может заблокировать запрос.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }

  // Уже разрешено или уже отказано — повторный запрос бесполезен
  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return "denied";
  }
}

/**
 * Можно ли сейчас показывать системные уведомления?
 */
export function canShowNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    Notification.permission === "granted"
  );
}

/** Вкладка сейчас в фокусе? */
export function isTabFocused(): boolean {
  if (typeof window === "undefined") return true;
  return document.hasFocus();
}

export interface BackgroundNotificationOptions {
  /** Заголовок уведомления, например "Новое сообщение" */
  title: string;
  /** Текст, например "Вася: Привет, как дела?" */
  body: string;
  /** Иконка уведомления */
  icon?: string;
  /**
   * Тег для группировки. Уведомления с одинаковым tag
   * заменяют друг друга вместо того чтобы плодиться.
   * Например: "message-{chatId}"
   */
  tag?: string;
  /** Куда перейти при клике на уведомление */
  url?: string;
}

/**
 * Показать системное уведомление если вкладка в фоне.
 *
 * @returns true если уведомление показано,
 *          false если вкладка в фокусе или нет разрешения
 *          (в этом случае покажи in-app toast вместо этого)
 */
export function showBackgroundNotification(
  options: BackgroundNotificationOptions
): boolean {
  // Вкладка в фокусе → системное уведомление не нужно
  if (isTabFocused()) {
    return false;
  }

  // Нет разрешения или браузер не поддерживает
  if (!canShowNotifications()) {
    return false;
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || DEFAULT_ICON,
      tag: options.tag,
      // Не вибрировать и без звука — не раздражать
      silent: false,
    });

    // Клик по уведомлению → фокус на вкладку + переход на страницу
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();

      if (options.url) {
        window.location.href = options.url;
      }

      notification.close();
    };

    return true;
  } catch (error) {
    console.error("Ошибка показа уведомления:", error);
    return false;
  }
}

/**
 * Закрыть все уведомления с определённым тегом.
 * Полезно: открыл чат → закрой уведомления из этого чата.
 */
export function closeNotificationsByTag(tag: string): void {
  // Notification API не даёт закрыть по тегу напрямую,
  // но можно сохранить ссылки. Пока оставим как заглушку.
  // Реализуем если понадобится.
  void tag;
}