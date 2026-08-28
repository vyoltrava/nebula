"use client";

/**
 * ПРАВАЯ ПАНЕЛЬ КАК «ПРОБКОВАЯ ДОСКА» — помечает aside (теги/авторы)
 * атрибутом data-ios-board, а её карточки — data-ios-pin (бумажные ярлыки,
 * приколотые кнопками). Группам после первой даётся data-ios-clip —
 * визитки авторов «прикрепляются» скрепкой (рисует CSS).
 */

import { useEffect } from "react";

function clearStamp(): void {
  document.querySelectorAll("[data-ios-board]").forEach((n) =>
    n.removeAttribute("data-ios-board")
  );
  document.querySelectorAll("[data-ios-pin]").forEach((n) => {
    n.removeAttribute("data-ios-pin");
    n.removeAttribute("data-ios-clip");
  });
}

function decorate(): void {
  const aside = document.querySelector<HTMLElement>('aside[class*="w-80"]');
  if (!aside) return;
  clearStamp();
  aside.setAttribute("data-ios-board", "");

  /* Карточки внутри доски: строки списков и прямые блоки-секции */
  const items = aside.querySelectorAll<HTMLElement>(
    'ul > li, [class*="space-y"] > *, [class*="divide-y"] > *'
  );
  const seenSections = new Set<HTMLElement>();
  let groupIndex = 0;

  items.forEach((item) => {
    const group = item.parentElement;
    if (!group) return;
    if (!seenSections.has(group)) {
      seenSections.add(group);
      groupIndex += 1;
    }
    if (groupIndex > 1) item.setAttribute("data-ios-clip", "");
    item.setAttribute("data-ios-pin", "");
  });
}

export function IosBoard() {
  useEffect(() => {
    decorate();
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(decorate);
    };
    const mo = new MutationObserver(schedule);
    const aside = document.querySelector('aside[class*="w-80"]');
    if (aside) {
      mo.observe(aside, { childList: true, subtree: true });
    } else {
      mo.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      clearStamp();
    };
  }, []);

  return null;
}
