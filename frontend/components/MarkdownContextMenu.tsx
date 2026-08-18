"use client";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Code, Link2, Eye, X } from "lucide-react";

interface MarkdownContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: "bold" | "italic" | "code" | "link" | "spoiler") => void;
}

export function MarkdownContextMenu({ x, y, onClose, onAction }: MarkdownContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [calculatedPos, setCalculatedPos] = useState({ x: 0, y: 0 });

  // Закрытие при клике вне меню или скролле
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // 🛡️ ЖЕЛЕЗОБЕТОННЫЙ РАСЧЁТ ПОЗИЦИИ (Динамический)
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const menuW = rect.width || 240;
      const menuH = rect.height || 280;
      const PAD = 16;

      let finalX = x;
      let finalY = y + 10; // По умолчанию показываем ЧУТЬ НИЖЕ курсора

      // 1. Если не влезает снизу -> показываем НАД курсором
      if (finalY + menuH > window.innerHeight - PAD) {
        finalY = y - menuH;
      }

      // 2. Если после этого оно улетело выше экрана (значит курсор был слишком высоко) -> прижимаем к верху
      if (finalY < PAD) {
        finalY = PAD;
      }

      // 3. Горизонтальные ограничения
      if (finalX + menuW > window.innerWidth - PAD) {
        finalX = window.innerWidth - menuW - PAD;
      }
      if (finalX < PAD) {
        finalX = PAD;
      }

      setCalculatedPos({ x: finalX, y: finalY });
    }
  }, [x, y]);

  const buttons = [
    { icon: Bold, label: "Жирный", action: "bold" as const, shortcut: "Ctrl+B" },
    { icon: Italic, label: "Курсив", action: "italic" as const, shortcut: "Ctrl+I" },
    { icon: Code, label: "Код", action: "code" as const, shortcut: "Ctrl+`" },
    { icon: Link2, label: "Ссылка", action: "link" as const, shortcut: "Ctrl+K" },
    { icon: Eye, label: "Спойлер", action: "spoiler" as const, shortcut: "Ctrl+S" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      
      <div
        ref={menuRef}
        // Используем calculatedPos вместо сырых x/y
        className="fixed z-[301] bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[200px] animate-in fade-in zoom-in-95 duration-150"
        style={{ left: calculatedPos.x, top: calculatedPos.y }}
      >
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Форматирование</span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-0.5">
            <X size={14} />
          </button>
        </div>

        <div className="py-1">
          {buttons.map((btn, i) => (
            <button
              key={i}
              onClick={() => {
                onAction(btn.action);
                onClose();
              }}
              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-white/10 transition-colors text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-[#8b5cf6]/20 transition-colors">
                <btn.icon size={16} className="text-white/70 group-hover:text-[#8b5cf6]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{btn.label}</p>
                <p className="text-[10px] text-white/40">{btn.shortcut}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-white/10 bg-white/[0.02]">
          <p className="text-[10px] text-white/40 text-center">
            Выдели текст, затем выбери формат
          </p>
        </div>
      </div>
    </>
  );
}