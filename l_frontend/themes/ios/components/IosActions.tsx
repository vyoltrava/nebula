"use client";

/**
 * ДЕКОРАТОР ДЕЙСТВИЙ — помечает кнопки индустриальными data-атрибутами:
 *  - data-ios-btn="like|comment|share|delete|bookmark|edit|more" — по классу
 *    lucide-иконки внутри кнопки (lucide-heart, lucide-message-circle, …);
 *  - data-ios-composer — контейнер формы создания поста («старое письмо»);
 *  - data-ios-seal — кнопка публикации внутри композера (сургучная печать).
 * CSS рисует по этим атрибутам авиационные кнопки, печать и открытку.
 */

import { useEffect } from "react";

const BTN_MAP: Array<[RegExp, string]> = [
  [/lucide-heart/, "like"],
  [/lucide-message-circle|lucide-message-square|lucide-messages-square/, "comment"],
  [/lucide-share2|lucide-share|lucide-forward|lucide-repeat/, "share"],
  [/lucide-trash2|lucide-trash/, "delete"],
  [/lucide-bookmark/, "bookmark"],
  [/lucide-pen|lucide-pencil|lucide-edit/, "edit"],
  [/lucide-more-horizontal|lucide-ellipsis|lucide-more-vertical/, "more"],
];

function clearStamp(scope: ParentNode): void {
  scope.querySelectorAll("[data-ios-btn]").forEach((n) =>
    n.removeAttribute("data-ios-btn")
  );
  scope.querySelectorAll("[data-ios-composer]").forEach((n) =>
    n.removeAttribute("data-ios-composer")
  );
  scope.querySelectorAll("[data-ios-seal]").forEach((n) =>
    n.removeAttribute("data-ios-seal")
  );
}

function decorate(): void {
  const root = document.querySelector("main") ?? document.body;
  clearStamp(root);

  /* 1. Кнопки-действия по иконкам */
  root.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    const svg = btn.querySelector("svg[class*='lucide-']");
    if (!svg) return;
    const cls = svg.getAttribute("class") ?? "";
    for (const [re, kind] of BTN_MAP) {
      if (re.test(cls)) {
        btn.setAttribute("data-ios-btn", kind);
        break;
      }
    }
  });

  /* 2. Композер: textarea → контейнер с кнопкой публикации */
  const textarea = root.querySelector("textarea");
  if (textarea) {
    let cursor: HTMLElement | null = textarea.parentElement;
    let composer: HTMLElement | null = null;
    let guard = 0;
    while (cursor && guard++ < 6) {
      if (cursor.querySelector("button")) {
        composer = cursor;
        break;
      }
      cursor = cursor.parentElement;
    }
    if (composer) {
      composer.setAttribute("data-ios-composer", "");
      const seal = composer.querySelector<HTMLButtonElement>(
        "button[type='submit'], button"
      );
      if (seal) seal.setAttribute("data-ios-seal", "");
    }
  }
}

export function IosActions() {
  useEffect(() => {
    decorate();
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(decorate);
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      clearStamp(document.querySelector("main") ?? document.body);
    };
  }, []);

  return null;
}
