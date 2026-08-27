"use client";

/**
 * СПИСКИ КАК «БУМАЖНЫЕ КАРТОЧКИ» — маршрутные декораторы для страниц
 * сообщений и уведомлений. Метод markIosList находит общий контейнер списка
 * в живом DOM и помечает его data-ios-list, а строки — data-ios-tile.
 * Бумажный вид задаёт ios-layout.css.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Общий механизм: найти контейнер списка и разметить под карточки */
export function markIosList(attr: string, selectors: string[]): () => void {
  const clear = () => {
    document
      .querySelectorAll<HTMLElement>("[data-ios-list]")
      .forEach((node) => {
        if (node.dataset.iosList === attr) {
          node.removeAttribute("data-ios-list");
        }
      });
    document
      .querySelectorAll("[data-ios-tile]")
      .forEach((node) => node.removeAttribute("data-ios-tile"));
  };

  const decorate = () => {
    clear();
    for (const selector of selectors) {
      const first = document.querySelector(selector);
      if (!first) continue;

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
        container.dataset.iosList = attr;
        Array.from(container.children).forEach((child) =>
          child.setAttribute("data-ios-tile", "")
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

export function IosChats() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname?.startsWith("/messages")) return;
    return markIosList("dialogs", DIALOG_SELECTORS);
  }, [pathname]);

  return null;
}