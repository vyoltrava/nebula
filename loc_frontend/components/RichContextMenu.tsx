// loc_frontend/components/RichContextMenu.tsx
"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Undo2, Redo2, Scissors, Copy, ClipboardPaste, Trash2, CheckSquare,
  ChevronRight, Bold, Italic, Code, Link2, EyeOff, Type,
} from "lucide-react";
import type { MarkdownType } from "@/lib/richText";

/* ============ ТИПЫ (конфиг пунктов — легко расширять) ============ */

export type RichMenuItem = {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean; // линия сверху, как в ТГ
  onClick?: () => void;
  children?: RichMenuItem[]; // сабменю (стрелочка >)
};

export type RichHandlers = {
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  del: () => void;
  selectAll: () => void;
  format: (t: MarkdownType) => void;
};

/** Дефолтное меню как в Telegram. Новые пункты добавляй сюда. */
export function buildRichMenuItems(h: RichHandlers): RichMenuItem[] {
  return [
    { id: "undo", label: "Отменить", icon: Undo2, shortcut: "Ctrl+Z", onClick: h.undo },
    { id: "redo", label: "Повторить", icon: Redo2, shortcut: "Ctrl+Y", onClick: h.redo },
    { id: "cut", label: "Вырезать", icon: Scissors, shortcut: "Ctrl+X", separatorBefore: true, onClick: h.cut },
    { id: "copy", label: "Копировать", icon: Copy, shortcut: "Ctrl+C", onClick: h.copy },
    { id: "paste", label: "Вставить", icon: ClipboardPaste, shortcut: "Ctrl+V", onClick: h.paste },
    { id: "delete", label: "Удалить", icon: Trash2, danger: true, onClick: h.del },
    {
      id: "format", label: "Форматирование", icon: Type, separatorBefore: true,
      children: [
        { id: "bold", label: "Жирный", icon: Bold, shortcut: "Ctrl+B", onClick: () => h.format("bold") },
        { id: "italic", label: "Курсив", icon: Italic, shortcut: "Ctrl+I", onClick: () => h.format("italic") },
        { id: "code", label: "Код", icon: Code, shortcut: "Ctrl+E", onClick: () => h.format("code") },
        { id: "spoiler", label: "Спойлер", icon: EyeOff, onClick: () => h.format("spoiler") },
        { id: "link", label: "Ссылка", icon: Link2, onClick: () => h.format("link") },
      ],
    },
    { id: "selectAll", label: "Выбрать всё", icon: CheckSquare, shortcut: "Ctrl+A", separatorBefore: true, onClick: h.selectAll },
  ];
}

/* ============ КОМПОНЕНТ МЕНЮ ============ */

type Props = {
  x: number;
  y: number;
  items: RichMenuItem[];
  onClose: () => void;
  zIndex?: number;
};

const MENU_W = 240;

export function RichContextMenu({ x, y, items, onClose, zIndex = 9990 }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [subPos, setSubPos] = useState({ x: 0, y: 0 });

  // кламп в экран
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (ny + r.height > window.innerHeight - 8) ny = Math.max(8, y - r.height); // вверх
    setPos({ x: nx, y: ny });
  }, [x, y]);

  // закрытие: клик мимо / Escape / скролл / resize
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const openSubmenu = (id: string, rect: DOMRect, count: number) => {
    let sx = rect.right - 6;
    if (sx + MENU_W > window.innerWidth - 8) sx = Math.max(8, rect.left - MENU_W + 6);
    const approxH = count * 40 + 12;
    let sy = rect.top - 6;
    if (sy + approxH > window.innerHeight - 8) sy = Math.max(8, window.innerHeight - approxH - 8);
    setSubPos({ x: sx, y: sy });
    setOpenSub(id);
  };

  const renderItem = (item: RichMenuItem) => {
    const Icon = item.icon;
    return (
      <React.Fragment key={item.id}>
        {item.separatorBefore && <div className="h-px bg-white/10 my-1" />}
        <button
          // ❗️ не отдаём фокус/выделение редактора
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseEnter={(e) => item.children && openSubmenu(item.id, e.currentTarget.getBoundingClientRect(), item.children.length)}
          onClick={(e) => {
            e.stopPropagation();
            if (item.children) {
              openSubmenu(item.id, e.currentTarget.getBoundingClientRect(), item.children.length);
              return;
            }
            onClose();
            item.onClick?.();
          }}
          disabled={item.disabled}
          className={`w-full px-3 py-2 flex items-center gap-2.5 text-[13px] rounded-lg transition-colors ${
            item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10 active:bg-white/15"
          } ${item.danger ? "text-red-400" : "text-white/90"}`}
        >
          {Icon && <Icon size={15} className={item.danger ? "text-red-400" : "text-white/50"} />}
          <span className="flex-1 text-left truncate">{item.label}</span>
          {item.shortcut && <span className="text-[11px] text-white/30">{item.shortcut}</span>}
          {item.children && <ChevronRight size={14} className="text-white/40" />}
        </button>
      </React.Fragment>
    );
  };

  const subItems = items.find((i) => i.id === openSub)?.children;

  return (
    <div ref={rootRef} className="fixed inset-0 pointer-events-none" style={{ zIndex }} onContextMenu={(e) => e.preventDefault()}>
      {/* основная панель */}
      <div
        ref={mainRef}
        className="pointer-events-auto p-1.5 rounded-xl border border-white/10 bg-[#1f1f23]/95 backdrop-blur-xl shadow-2xl"
        style={{ position: "fixed", left: pos.x, top: pos.y, width: MENU_W }}
      >
        {items.map(renderItem)}
      </div>

      {/* сабменю */}
      {openSub && subItems && (
        <div
          className="pointer-events-auto p-1.5 rounded-xl border border-white/10 bg-[#1f1f23]/95 backdrop-blur-xl shadow-2xl"
          style={{ position: "fixed", left: subPos.x, top: subPos.y, width: MENU_W }}
        >
          {subItems.map(renderItem)}
        </div>
      )}
    </div>
  );
}