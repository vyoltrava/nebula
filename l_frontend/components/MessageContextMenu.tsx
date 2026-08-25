"use client";
import { useEffect, useRef, useState } from "react";
import {
  CheckSquare, Copy, Send, Edit2, Trash2, Pin, PinOff, Reply,
} from "lucide-react";

interface MenuItem {
  icon: any;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface MessageContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function MessageContextMenu({ x, y, items, onClose }: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ x, y });

  // Подгоняем позицию чтобы меню не вылезло за экран
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let newX = x;
    let newY = y;

    if (x + rect.width > vw - 8) newX = vw - rect.width - 8;
    if (y + rect.height > vh - 8) newY = vh - rect.height - 8;
    if (newX < 8) newX = 8;
    if (newY < 8) newY = 8;

    setAdjustedPos({ x: newX, y: newY });
  }, [x, y]);

  // Закрытие по клику вне меню, по Escape, по скроллу
  useEffect(() => {
    const handleClick = () => onClose();
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

  return (
    <>
      <div
        ref={menuRef}
        className="fixed z-[300] bg-white dark:bg-[#1f1f23] border border-gray-200 dark:border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[180px] py-1 animate-in fade-in zoom-in-95 duration-100"
        style={{
          left: adjustedPos.x,
          top: adjustedPos.y,
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
      </div>
    </>
  );
}

// Экспортируем Reply для использования в родителе
export { Reply };