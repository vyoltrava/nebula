"use client";

/**
 * Хедер в стиле Panorama: гигантский заголовок уходит за левый край
 * экрана (translateX(-20%), opacity .9), под ним подзаголовок
 * (количество постов/уведомлений). Sticky top:0 z-index:100.
 *
 * При скролле заголовок плавно уменьшается: обработчик переключает
 * data-scrolled, а переход делают CSS transition на font-size/transform
 * (см. zune-layout.css).
 */

import { useEffect, useRef } from "react";

interface ZuneHeaderProps {
  title: string;
  /** Подзаголовок: количество постов / уведомлений и т.п. */
  subtitle?: string;
  /** Скроллящийся контейнер; по умолчанию — окно */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Порог срабатывания «сжатия», px */
  shrinkAfter?: number;
}

export function ZuneHeader({
  title,
  subtitle,
  scrollRef,
  shrinkAfter = 48,
}: ZuneHeaderProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;

    let rafId = 0;

    const apply = () => {
      rafId = 0;
      const top =
        scrollRef && scrollRef.current
          ? scrollRef.current.scrollTop
          : window.scrollY || document.documentElement.scrollTop || 0;

      /* 1) сжатие заголовка после порога */
      node.dataset.scrolled = top > shrinkAfter ? "true" : "false";

      /* 2) лёгкий параллакс-сдвиг (до 12px) */
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (!reduced.matches) {
        const shift = Math.min(12, Math.abs(top) * 0.05);
        node.style.setProperty("--zune-parallax", `${shift.toFixed(1)}px`);
      }
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
  }, [scrollRef, shrinkAfter]);

  return (
    <header ref={nodeRef} className="zune-panorama">
      <h1 className="zune-panorama-title" aria-label={title}>
        {title}
      </h1>
      {subtitle ? <p className="zune-panorama-subtitle">{subtitle}</p> : null}
    </header>
  );
}
