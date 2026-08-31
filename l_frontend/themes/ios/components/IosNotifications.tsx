"use client";

/**
 * УВЕДОМЛЕНИЯ КАК «БУМАЖНЫЕ КАРТОЧКȻ — маршрутный декоратор /notifications
 * (см. общий механизм в IosChats). Бумажный вид задаёт ios-layout.css.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { markIosList } from "./IosChats";

const NOTIF_SELECTORS = [
  'a[href^="/post/"]',
  'a[href^="/user/"]',
  'a[href*="chat="]',
];

export function IosNotifications() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/notifications")) return;
    return markIosList("notifs", NOTIF_SELECTORS);
  }, [pathname]);

  return null;
}