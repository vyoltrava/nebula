"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, Code, Link2, Eye, X } from "lucide-react";

interface MarkdownContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: "bold" | "italic" | "code" | "link" | "spoiler") => void;
}

export function MarkdownContextMenu({ x, y, onClose, onAction }: MarkdownContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Закрытие при клике вне меню
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    // Также закрываем при скролле, чтобы меню не "улетало" от текста
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // 🛡️ ЖЕЛЕЗОБЕТОННЫЙ РАСЧЁТ ПОЗИЦИИ
  // Берём размеры с запасом, чтобы точно не вылезло
  const MENU_W = 240;
  const MENU_H = 320; // С большим запасом на все отступы и кнопки
  const PAD = 16;

  let finalX = x;
  let finalY = y;

  // 1. Не даем уйти за правый край
  if (finalX + MENU_W > window.innerWidth - PAD) {
    finalX = window.innerWidth - MENU_W - PAD;
  }
  // 2. Не даем уйти за левый край
  if (finalX < PAD) {
    finalX = PAD;
  }

  // 3. ГЛАВНОЕ: Если снизу не влезает, показываем меню НАД точкой клика, а не под ней
  if (finalY + MENU_H > window.innerHeight - PAD) {
    finalY = y - MENU_H;
  }
  // 4. Если и сверху не влезает (очень маленький экран), прижимаем к верху
  if (finalY < PAD) {
    finalY = PAD;
  }

  const buttons = [
    { icon: Bold, label: "Жирный", action: "bold" as const, shortcut: "Ctrl+B" },
    { icon: Italic, label: "Курсив", action: "italic" as const, shortcut: "Ctrl+I" },
    { icon: Code, label: "Код", action: "code" as const, shortcut: "Ctrl+`" },
    { icon: Link2, label: "Ссылка", action: "link" as const, shortcut: "Ctrl+K" },
    { icon: Eye, label: "Спойлер", action: "spoiler" as const, shortcut: "Ctrl+S" },
  ];

  return (
    <>
      {/* Затемнённый фон */}
      <div className="fixed inset-0 z-[300] bg-black/20 backdrop-blur-[1px]" onClick={onClose} />
      
      {/* Меню */}
      <div
        ref={menuRef}
        className="fixed z-[301] bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden min-w-[200px] animate-in fade-in zoom-in-95 duration-150"
        style={{ left: finalX, top: finalY }}
      >
        {/* Заголовок */}
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Форматирование</span>
          <button onClick={onClose} className="text-white/40 hover:text-white p-0.5">
            <X size={14} />
          </button>
        </div>

        {/* Кнопки */}
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

        {/* Подсказка */}
        <div className="px-3 py-2 border-t border-white/10 bg-white/[0.02]">
          <p className="text-[10px] text-white/40 text-center">
            Выдели текст, затем выбери формат
          </p>
        </div>
      </div>
    </>
  );
}