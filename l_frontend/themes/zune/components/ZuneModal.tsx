"use client";

/**
 * Модальное окно в стиле Windows Phone: ПОЛНОЭКРАННОЕ,
 * затемнение фона rgba(0,0,0,.8), белый текст на чёрном,
 * крупный X без фона справа сверху. Появление: scale(.95)→1 + fade.
 * Закрытие: клик по оверлею, Esc, кнопка X.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ZuneModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function ZuneModal({ open, onClose, title, children }: ZuneModalProps) {
  const mountedRef = useRef(false);

  /* createPortal требует document — ждём монтирования */
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    /* Блокируем прокрутку фона под модалкой */
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="zune-modal-overlay open"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="zune-modal">
        <button
          type="button"
          className="zune-modal-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ✕
        </button>
        {title ? <h2 className="zune-modal-title">{title}</h2> : null}
        <div className="zune-modal-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
