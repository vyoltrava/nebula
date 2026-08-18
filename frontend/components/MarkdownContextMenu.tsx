"use client";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Code, Link2, Eye } from "lucide-react";

interface MarkdownContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: "bold" | "italic" | "code" | "link" | "spoiler") => void;
}

export function MarkdownContextMenu({ x, y, onClose, onAction }: MarkdownContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

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

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const w = rect.width || 280;
    const h = rect.height || 48;
    const PAD = 8;

    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;

    // ВСЕГДА над курсором
    let finalY = y - h - 8;
    if (finalY < PAD) finalY = PAD;

    // По X — центрируем относительно курсора, но не вылетаем за края
    let finalX = x - w / 2;
    if (finalX < PAD) finalX = PAD;
    if (finalX + w > vw - PAD) finalX = vw - w - PAD;

    setPos({ x: finalX, y: finalY });
  }, [x, y]);

  const btn = (Icon: any, label: string, action: "bold" | "italic" | "code" | "link" | "spoiler") => (
    <button
      key={action}
      onClick={() => { onAction(action); onClose(); }}
      className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 active:scale-90 transition-all text-white/70 hover:text-white"
      title={label}
    >
      <Icon size={16} />
    </button>
  );

  const sep = <div key={Math.random()} className="w-px h-6 bg-white/10 mx-0.5" />;

  return (
    <>
      <div className="fixed inset-0 z-[300]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[301] bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl px-1.5 py-1 flex items-center gap-0.5"
        style={{ left: pos.x, top: pos.y }}
      >
        {btn(Bold, "Жирный", "bold")}
        {btn(Italic, "Курсив", "italic")}
        {sep}
        {btn(Code, "Код", "code")}
        {btn(Link2, "Ссылка", "link")}
        {sep}
        {btn(Eye, "Спойлер", "spoiler")}
      </div>
    </>
  );
}