// loc_frontend/components/RichContextMenu.tsx
"use client";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Undo2, Redo2, Scissors, Copy, ClipboardPaste, Trash2, CheckSquare,
  ChevronRight, Bold, Italic, Code, Link2, EyeOff, Type,
} from "lucide-react";
import type { MarkdownType } from "@/lib/richText";

export type RichMenuItem = {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onClick?: () => void;
  children?: RichMenuItem[];
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

  // 📱 Телефон? → меню как центрированная модалка (клавиатура не влияет)
  const [isCoarse] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches
  );
  // Видимая область экрана с учётом клавиатуры (visualViewport)
  const [viewport] = useState(() => {
    if (typeof window === "undefined") return { top: 0, height: 800 };
    const vv = (window as any).visualViewport;
    return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
  });

  // 🖥️ ПК: открываемся ВВЕРХ от точки клика
  useLayoutEffect(() => {
    if (isCoarse) return;
    const el = mainRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y - r.height - 8;
    if (nx + r.width > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - r.width - 8);
    if (nx < 8) nx = 8;
    if (ny < 8) ny = Math.min(y + 8, window.innerHeight - r.height - 8);
    setPos({ x: nx, y: ny });
  }, [x, y, isCoarse]);

  // Закрытие + глушение нативного contextmenu
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = () => { if (!isCoarse) onClose(); }; // на мобилках скролл≠закрытие (клавиатура!)
    const onCtx = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("contextmenu", onCtx, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("contextmenu", onCtx, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose, isCoarse]);

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
        {item.separatorBefore && <div className="h-px bg-gray-100 dark:bg-white/10 my-1" />}
        <button
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.stopPropagation()}
          onMouseEnter={(e) => item.children && !isCoarse && openSubmenu(item.id, e.currentTarget.getBoundingClientRect(), item.children.length)}
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
          className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-[13px] rounded-lg transition-colors ${
            item.disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100 dark:hover:bg-white/10 active:bg-gray-100 dark:active:bg-white/15"
          } ${item.danger ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-white/90"}`}
        >
          {Icon && <Icon size={15} className={item.danger ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-white/50"} />}
          <span className="flex-1 text-left truncate">{item.label}</span>
          {item.shortcut && !isCoarse && <span className="text-[11px] text-gray-500 dark:text-white/30">{item.shortcut}</span>}
          {item.children && <ChevronRight size={14} className="text-gray-500 dark:text-white/40" />}
        </button>
      </React.Fragment>
    );
  };

  const subItems = items.find((i) => i.id === openSub)?.children;

  const panel = (
    <div
      ref={mainRef}
      className="pointer-events-auto p-1.5 rounded-xl border border-line dark:border-white/10 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-xl shadow-2xl"
      style={isCoarse ? { width: MENU_W } : { position: "fixed", left: pos.x, top: pos.y, width: MENU_W }}
    >
      {items.map(renderItem)}
    </div>
  );

  const submenu = openSub && subItems && (
    <div
      className="pointer-events-auto p-1.5 rounded-xl border border-line dark:border-white/10 bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-xl shadow-2xl"
      style={{ position: "fixed", left: subPos.x, top: subPos.y, width: MENU_W }}
    >
      {subItems.map(renderItem)}
    </div>
  );

  return createPortal(
    <div ref={rootRef} onContextMenu={(e) => e.preventDefault()}>
      {isCoarse ? (
        /* 📱 МОБИЛКА: центрированная модалка с затемнением, как в TG */
        <div className="fixed left-0 right-0" style={{ top: viewport.top, height: viewport.height, zIndex }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
            {panel}
          </div>
          {submenu}
        </div>
      ) : (
        /* 🖥️ ПК: у точки клика, вверх */
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex }}>
          {panel}
          {submenu}
        </div>
      )}
    </div>,
    document.body
  );
}