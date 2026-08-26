"use client";

import { useEffect, useRef } from "react";

/**
 * ZUNE PHONE DESIGN SYSTEM — заголовок-гигант с параллаксом.
 *
 * Комбинация position: sticky + transform: translateX():
 *  - sticky прижимает заголовок к верху скролл-контейнера;
 *  - базовый сдвиг за левый край задаёт CSS-переменная
 *    --zune-bleed-offset (−20%, на мобильных −30%);
 *  - при прокрутке контента rAF-обработчик пишет в переменную
 *    --zune-parallax небольшое смещение — заголовок «плывёт».
 */
export default function ZuneGiantHeader({ title, accent, scrollRef }) {
  const nodeRef = useRef(null);

  useEffect(() => {
    const scroller = scrollRef && scrollRef.current;
    const node = nodeRef.current;
    if (!scroller || !node) return undefined;

    let rafId = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const applyParallax = () => {
      rafId = 0;
      // статический сдвиг (--zune-bleed-offset) остаётся всегда,
      // отключаем только дополнительное движение
      if (reducedMotion.matches) {
        node.style.setProperty("--zune-parallax", "0px");
        return;
      }
      const shift = Math.min(14, Math.abs(scroller.scrollTop) * 0.055);
      node.style.setProperty("--zune-parallax", `${shift.toFixed(1)}px`);
    };

    const onScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(applyParallax);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    applyParallax();

    return () => {
      scroller.removeEventListener("scroll", onScroll);
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
