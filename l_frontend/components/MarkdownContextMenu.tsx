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

    // Р’РЎР•Р“Р”Рђ РЅР°Рґ РєСѓСЂСЃРѕСЂРѕРј
    let finalY = y - h - 8;
    if (finalY < PAD) finalY = PAD;

    // РџРѕ X вЂ” С†РµРЅС‚СЂРёСЂСѓРµРј РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РєСѓСЂСЃРѕСЂР°, РЅРѕ РЅРµ РІС‹Р»РµС‚Р°РµРј Р·Р° РєСЂР°СЏ
    let finalX = x - w / 2;
    if (finalX < PAD) finalX = PAD;
    if (finalX + w > vw - PAD) finalX = vw - w - PAD;

    setPos({ x: finalX, y: finalY });
  }, [x, y]);

  const btn = (Icon: any, label: string, action: "bold" | "italic" | "code" | "link" | "spoiler") => (
    <button
      key={action}
      onClick={() => { onAction(action); onClose(); }}
      className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all text-gray-800 dark:text-white/70 hover:text-gray-900 dark:hover:text-white"
      title={label}
    >
      <Icon size={16} />
    </button>
  );

  const sep = <div key={Math.random()} className="w-px h-6 bg-gray-100 dark:bg-white/10 mx-0.5" />;

  return (
    <>
      <div className="fixed inset-0 z-[300]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[301] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-xl shadow-2xl px-1.5 py-1 flex items-center gap-0.5"
        style={{ left: pos.x, top: pos.y }}
      >
        {btn(Bold, "Р–РёСЂРЅС‹Р№", "bold")}
        {btn(Italic, "РљСѓСЂСЃРёРІ", "italic")}
        {sep}
        {btn(Code, "РљРѕРґ", "code")}
        {btn(Link2, "РЎСЃС‹Р»РєР°", "link")}
        {sep}
        {btn(Eye, "РЎРїРѕР№Р»РµСЂ", "spoiler")}
      </div>
    </>
  );
}