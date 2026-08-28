"use client";

/**
 * ЗВУКИ И КИНЕМАТОГРАФ — глобальный движок темы:
 *  - по клику проигрывает физический звук (клавиши, индустриальные кнопки,
 *    ссылки, тумблеры) — делегирование на document;
 *  - клик по сургучной печати ([data-ios-seal]) запускает анимацию отправки:
 *    письмо складывается в конверт и летит вправо, затем с грохотом
 *    появляется штамп «Отправлено» с датой (шуршание + удар — Web Audio);
 *  - проставляет body[data-ios-page] для CSS-скоупинга страниц
 *    (закладки — ежедневник, уведомления — телеграфная лента) и озвучивает
 *    их открытие.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { iosSfx } from "../hooks/useIosSfx";

/** Анимация «письмо → конверт → полёт → штамп» (видеоряд в ios-animations.css) */
function playSendSequence(): void {
  iosSfx.paper();

  const stage = document.createElement("div");
  stage.className = "ios-send-stage";
  stage.setAttribute("aria-hidden", "true");

  const carrier = document.createElement("div");
  carrier.className = "ios-send-envelope";

  const paper = document.createElement("div");
  paper.className = "ios-send-face ios-send-paper";

  const envelope = document.createElement("div");
  envelope.className = "ios-send-face ios-send-env";

  carrier.append(paper, envelope);

  const stamp = document.createElement("div");
  stamp.className = "ios-send-stamp";
  stamp.textContent = `Отправлено · ${new Date().toLocaleDateString("ru-RU")}`;

  stage.append(carrier, stamp);
  document.body.appendChild(stage);

  window.setTimeout(() => iosSfx.stamp(), 1430);
  window.setTimeout(() => stage.remove(), 2050);
}

export function IosSfx() {
  const pathname = usePathname();

  /* Скоуп страницы + звук открытия раздела */
  useEffect(() => {
    const seg = pathname?.split("/").filter(Boolean)[0] ?? "home";
    document.body.dataset.iosPage = seg;
    if (seg === "notifications") iosSfx.telegraph();
    else if (seg === "bookmarks") iosSfx.flip();
    return () => {
      delete document.body.dataset.iosPage;
    };
  }, [pathname]);

  /* Звуковая делегация + триггер отправки письма */
  useEffect(() => {
    const arm = () => iosSfx.warm();
    document.addEventListener("pointerdown", arm, { passive: true });

    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      if (target.closest("[data-ios-seal]")) {
        playSendSequence();
        return;
      }

      const el = target.closest(
        "[data-ios-btn], button, a, [role='switch']"
      ) as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const kind = el.dataset?.iosBtn;
      if (kind === "like" || kind === "share") {
        iosSfx.clunk();
      } else if (kind === "delete") {
        iosSfx.clunk();
        window.setTimeout(() => iosSfx.stamp(), 90);
      } else if (tag === "A") {
        iosSfx.click();
      } else {
        iosSfx.press();
      }
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("pointerdown", arm);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}
