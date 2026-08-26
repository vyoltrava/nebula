"use client";

/**
 * ЧАТЫ КАК ПЛИТКИ METRO — маршрутный декоратор для страницы сообщений.
 * Ничего не рендерит визуально: находит список диалогов в живом DOM
 * (общий контейнер ссылок-диалогов), помечает его data-zune-list="dialogs",
 * а каждую строку — data-zune-tile. Плиточный вид задаёт zune-layout.css.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Общий механизм: найти контейнер списка и разметить под плитки */
export function markTileList(attr: string, selectors: string[]): () => void {
  const clear = () => {
    document.querySelectorAll<HTMLElement>("[data-zune-list]").forEach((node) => {
      if ((node as HTMLElement).dataset.zuneList === attr) {
        node.removeAttribute("data-zune-list");
      }
    });
    document
      .querySelectorAll("[data-zune-tile]")
      .forEach((node) => node.removeAttribute("data-zune-tile"));
  };

  const decorate = () => {
    clear();
    for (const selector of selectors) {
      const first = document.querySelector(selector);
      if (!first) continue;

      /* Подъём к минимальному общему контейнеру ≥3 детей */
      let cursor: HTMLElement | null = first.parentElement;
      let container: HTMLElement | null = null;
      let guard = 0;
      while (cursor && guard++ < 14) {
        if (cursor.children.length >= 3) {
          container = cursor;
          break;
        }
        cursor = cursor.parentElement;
      }

      if (container) {
        container.dataset.zuneList = attr;
        Array.from(container.children).forEach((child) =>
          child.setAttribute("data-zune-tile", "")
        );
        break;
      }
    }
  };

  decorate();
  const mo = new MutationObserver(decorate);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => {
    mo.disconnect();
    clear();
  };
}

const DIALOG_SELECTORS = [
  'a[href*="chat="]',
  'a[href^="/chat"]',
  'a[href^="/messages"]',
];

export function ZuneChats() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/messages")) return;
    return markTileList("dialogs", DIALOG_SELECTORS);
  }, [pathname]);

  return null;
}
