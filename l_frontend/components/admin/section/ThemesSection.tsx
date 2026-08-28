"use client";
import { useEffect, useState } from "react";
import { Layers, Wrench } from "lucide-react";
import { getToken } from "@/lib/auth";
import {
  setCachedShellSwitcherEnabled,
  SHELL_SWITCHER_EVENT,
  syncShellSwitcherFlag,
} from "@/lib/shellSwitcher";

export function ThemesSection({ me }: { me: any }) {
  /* 🎛️ Глобальный флаг «смены оболочек» (Zune / Old iOS).
     Пока выключен — переключатели скрыты у всех, у всех классика. */
  const [shellEnabled, setShellEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    syncShellSwitcherFlag().then((v) => {
      if (alive) setShellEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function toggleShellSwitcher() {
    if (saving) return;
    const next = !shellEnabled;
    setSaving(true);
    try {
      const form = new FormData();
      form.append("enabled", String(next));
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/settings/shell-switcher`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: form,
        }
      );
      if (res.ok) {
        setCachedShellSwitcherEnabled(next);
        setShellEnabled(next);
        window.dispatchEvent(
          new CustomEvent(SHELL_SWITCHER_EVENT, { detail: { enabled: next } })
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 🎛️ Смена оболочек (Zune / Old iOS) — глобальный переключатель */}
      <div className="border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Layers size={18} className="text-[#8b5cf6]" />
              Смена оболочек
            </h3>
            <p className="text-xs text-gray-600 dark:text-white/50 mt-1 max-w-lg">
              Показывать пользователям переключатели оболочек Zune и Old iOS в
              настройках. Пока выключено — у всех принудительно классическая
              тема (оболочки в разработке).
            </p>
          </div>
          <button
            onClick={toggleShellSwitcher}
            disabled={saving}
            role="switch"
            aria-checked={shellEnabled}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
              shellEnabled ? "bg-[#8b5cf6]" : "bg-gray-300 dark:bg-white/20"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                shellEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-white/40 mt-2">
          {shellEnabled
            ? "Включено — пользователи могут выбирать оболочку в настройках."
            : "Выключено — у всех пользователей классическая тема."}
        </p>
      </div>

      {/* Конструктор анимированных тем — ещё в разработке */}
      <div className="flex flex-col items-center justify-center py-24 border border-line dark:border-white/10 rounded-xl bg-gray-100 dark:bg-white/5">
        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
          <Wrench size={32} className="text-purple-600 dark:text-purple-400" />
        </div>
        <h2 className="text-xl font-black text-gray-900 dark:text-white mb-2">Технические работы</h2>
        <p className="text-gray-600 dark:text-white/50 text-sm text-center max-w-md">
          Конструктор тем находится в разработке. Скоро здесь можно будет создавать анимированные фоны для сообщества.
        </p>
      </div>
    </div>
  );
}