"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckSquare, Copy, Send, Edit2, Trash2, Pin, PinOff, Reply,
} from "lucide-react";

interface MenuItem {
  icon: any;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Прямоугольник кнопки-якоря (три точки) в viewport-координатах */
export interface MenuAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface MessageContextMenuProps {
  /** Свободные координаты (ПКМ / long-press). Взаимоисключимо с anchor. */
  x?: number;
  y?: number;
  /** Привязка к кнопке «три точки»: меню откроется НАД кнопкой (или под, если сверху нет места) */
  anchor?: MenuAnchor;
  /** Желаемое размещение относительно якоря */
  placement?: "top" | "bottom";
  items: MenuItem[];
  onClose: () => void;
}

const MARGIN = 8;
const GAP = 6;

function computeFromAnchor(
  anchor: MenuAnchor,
  placement: "top" | "bottom",
  width: number,
  height: number,
): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Выравнивание по правому краю кнопки (меню «выпадает» из точек)
  let x = anchor.right - width;
  if (x < MARGIN) x = MARGIN;
  if (x + width > vw - MARGIN) x = vw - width - MARGIN;

  // Сначала пробуем желаемую сторону, при нехватке места — флип на другую
  let y =
    placement === "top"
      ? anchor.top - height - GAP
      : anchor.bottom + GAP;

  if (placement === "top" && y < MARGIN) {
    y = anchor.bottom + GAP; // сверху не влезло → открываем под кнопкой
  }
  if (placement === "bottom" && y + height > vh - MARGIN) {
    y = anchor.top - height - GAP; // снизу не влезло → над кнопкой
  }

  // Финальные границы экрана
  if (y < MARGIN) y = MARGIN;
  if (y + height > vh - MARGIN) y = Math.max(MARGIN, vh - height - MARGIN);
  return { x, y };
}

function computeFromPoint(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let newX = x;
  let newY = y;
  if (newX + width > vw - MARGIN) newX = vw - width - MARGIN;
  if (newY + height > vh - MARGIN) newY = vh - height - MARGIN;
  if (newX < MARGIN) newX = MARGIN;
  if (newY < MARGIN) newY = MARGIN;
  return { x: newX, y: newY };
}

export function MessageContextMenu({ x, y, anchor, placement = "top", items, onClose }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x: x ?? 0, y: y ?? 0 });
  const [measured, setMeasured] = useState(false);

  // Измеряем реальный размер меню и ставим его точно к якорю/точке.
  // useLayoutEffect — до отрисовки кадра, без «прыжка» на экране.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pos =
      anchor
        ? computeFromAnchor(anchor, placement, rect.width, rect.height)
        : computeFromPoint(x ?? 0, y ?? 0, rect.width, rect.height);
    setAdjustedPos(pos);
    setMeasured(true);
  }, [anchor, placement, x, y]);

  // Закрытие по клику вне меню, по Escape, по скроллу
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Клик по самому меню (и внутри портала) не закрывает его
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();
    const handleContextMenu = () => onClose();

    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleEsc);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [onClose]);

  // 🛡 Portal в <body>: меню не зависит от transformed/backdrop-filter
  // предков (свайп-обёртки сообщений, стеклянные панели, темы) —
  // position:fixed всегда считается от вьюпорта.
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[300] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: adjustedPos.x,
        top: adjustedPos.y,
        // до измерения прячем, чтобы не мигало в углу (0,0)
        visibility: measured ? "visible" : "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-colors ${
            item.danger
              ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
              : "text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
          }`}
        >
          <item.icon size={15} />
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// Экспортируем Reply для использования в родителе
export { Reply };