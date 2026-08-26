"use client";
import { ReactNode, useEffect } from "react";

/** Ретро-дисплей статистики (как на старых компьютерах). */
export function StatDisplay({ label, value, color = "lime", hint }: {
  label: string;
  value: string | number;
  color?: "lime" | "cyan" | "pink" | "purple" | "yellow";
  hint?: string;
}) {
  const glow: Record<string, { c: string; s: string }> = {
    lime: { c: "#39FF14", s: "rgba(57,255,20,0.75)" },
    cyan: { c: "#00F5FF", s: "rgba(0,245,255,0.75)" },
    pink: { c: "#FF006E", s: "rgba(255,0,110,0.75)" },
    purple: { c: "#B026FF", s: "rgba(176,38,255,0.75)" },
    yellow: { c: "#FFE600", s: "rgba(255,230,0,0.7)" },
  };
  const { c, s } = glow[color] ?? glow.lime;
  return (
    <div
      className="prv-stat"
      title={hint}
      style={{ color: c, textShadow: `0 0 8px ${s}`, borderColor: `${c}52` }}
    >
      <div className="prv-stat-label">{label}</div>
      <div className="text-xl leading-tight">{value}</div>
    </div>
  );
}

/** Терминальное уведомление с мигающим курсором. */
export function Terminal({ children, tone = "yellow" }: {
  children: ReactNode;
  tone?: "yellow" | "red" | "cyan";
}) {
  const c = tone === "red" ? "#FF006E" : tone === "cyan" ? "#00F5FF" : "#FFE600";
  return (
    <div className="prv-terminal" style={{ borderColor: `${c}8c`, color: c }}>
      <span className="prv-cursor" />
      <span className="pl-1">{children}</span>
    </div>
  );
}

/** Аркадное модальное окно с хром-углами. */
export function PrismeModal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="prv-modal relative z-10 max-w-lg w-full">
        <div className="prv-modal-corner tl" />
        <div className="prv-modal-corner tr" />
        <div className="prv-modal-corner bl" />
        <div className="prv-modal-corner br" />
        <div className="prv-modal-inner">
          <div className="flex items-center justify-between mb-4">
            <h3 className="prv-heading text-lg prv-glow-cyan">{title}</h3>
            <button
              className="prv-btn prv-btn--ghost !px-2 !py-1 text-sm"
              onClick={onClose}
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Заголовок страницы с хроматической аберрацией. */
export function PrismeTitle({ children }: { children: string }) {
  return (
    <h1 className="prv-heading text-3xl sm:text-4xl prv-chromatic" data-text={children}>
      {children}
    </h1>
  );
}