"use client";

/**
 * Шапка Zune: гигантский заголовок, уходящий за левый край экрана
 * (--zune-bleed-offset), с параллаксом при скролле.
 *
 * position: sticky + transform: translateX(): sticky прижимает заголовок
 * к верху, а смещение складывается из двух переменных:
 *   --zune-bleed-offset  — статический сдвиг за край (CSS, по ТЗ −25%);
 *   --zune-parallax      — динамический сдвиг при прокрутке (пишется здесь).
 *
 * Если передан scrollRef — слушаем внутренний контейнер,
 * иначе — скролл окна (типичный режим ленты соцсети).
 */

import { useEffect, useRef } from "react";

interface ZuneHeaderProps {
  title: string;
  /** Акцентная часть слова, красится маджентой */
  accent?: string;
  /** Скроллящийся контейнер; если не задан — используется window */
  scrollRef?: React.RefObject<HTMLElement | null>;
}

const MAX_PARALLAX = 14; // px

export function ZuneHeader({ title, accent, scrollRef }: ZuneHeaderProps) {
  const nodeRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;

    let rafId = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    const computeShift = (): number => {
      const top =
        scrollRef && scrollRef.current
          ? scrollRef.current.scrollTop
          : window.scrollY || document.documentElement.scrollTop || 0;
      return Math.min(MAX_PARALLAX, Math.abs(top) * 0.055);
    };

    const apply = () => {
      rafId = 0;
      if (reduced.matches) {
        node.style.setProperty("--zune-parallax", "0px");
        return;
      }
      node.style.setProperty("--zune-parallax", `${computeShift().toFixed(1)}px`);
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(apply);
    };

    const target: HTMLElement | Window = scrollRef?.current ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    apply();

    return () => {
      target.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [scrollRef]);

  return (
    <h1 ref={nodeRef} className="zt-giant" aria-label={title}>
      {title}
      {accent ? <em>&nbsp;{accent}</em> : null}
    </h1>
  );
}
