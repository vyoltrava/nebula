"use client";

/**
 * 🎯 Ш в стиле WP Panorama — Zune-версия.
 *
 * ★ Overscan / Parallax ★
 * игантский заголовок (48-64px) уходит за левый край экрана
 * (transform: translateX(-25%)) и слегка смещается при скролле.
 * иксированная (position: sticky), остаётся наверху.
 */
import { useEffect, useState, useRef, type FC } from "react";
import { useZuneTheme } from "../hooks/useZuneTheme";

export interface ZuneHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const ZuneHeader: FC<ZuneHeaderProps> = ({ title, subtitle, actions }) => {
  const { isZuneTheme } = useZuneTheme();
  const [scrolled, setScrolled] = useState(false);
  const scrollRaf = useRef<number | null>(null);

  useEffect(() => {
    if (!isZuneTheme) return;
    const onScroll = () => {
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
      scrollRaf.current = requestAnimationFrame(() => setScrolled(window.scrollY > 40));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    };
  }, [isZuneTheme]);

  return (
    <header className="zune-header">
      <div className="zune-header-content">
        <h1 className="zune-title" data-scrolled={scrolled || undefined} aria-label={title}>
          {title}
        </h1>
        {subtitle && <p className="zune-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="zune-header-actions">{actions}</div>}
    </header>
  );
};
