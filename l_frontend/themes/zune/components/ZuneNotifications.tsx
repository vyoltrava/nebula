"use client";

/**
 * УВЕДОМЛЕНИЯ КАК ПЛИТКИ METRO — маршрутный декоратор страницы /notifications
 * (см. общий механизм в ZuneChats). Плиточный вид и каскад появления
 * задаются zune-layout.css по [data-zune-list="notifs"].
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { markTileList } from "./ZuneChats";

const NOTIF_SELECTORS = ['a[href^="/post/"]', 'a[href^="/user/"]', 'a[href*="chat="]'];

export function ZuneNotifications() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/notifications")) return;
    return markTileList("notifs", NOTIF_SELECTORS);
  }, [pathname]);

  return null;
}
