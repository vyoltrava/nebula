// components/ChatMuteButton.tsx
// 🔕 Отключение уведомлений чата: на 1ч/8ч/24ч, навсегда, или включить обратно.
'use client';

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";
import { Bell, BellOff } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";

const PRESETS: { labelKey: "mute.for1h" | "mute.for8h" | "mute.for24h" | "mute.forever"; minutes?: number; forever?: boolean }[] = [
  { labelKey: "mute.for1h", minutes: 60 },
  { labelKey: "mute.for8h", minutes: 480 },
  { labelKey: "mute.for24h", minutes: 1440 },
  { labelKey: "mute.forever", forever: true },
];

export function ChatMuteButton({ chatId }: { chatId: number }) {
  const { t } = useI18n();
  const [muted, setMuted] = useState(false);
  const [forever, setForever] = useState(false);
  const [untilLabel, setUntilLabel] = useState<string>("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch(`/api/chats/${chatId}/mute`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.muted_until) {
          setMuted(true);
          setForever(!!d.forever);
          setUntilLabel(d.forever ? "" : new Date(d.muted_until).toLocaleString());
        } else {
          setMuted(false);
          setForever(false);
          setUntilLabel("");
        }
      })
      .catch(() => {});
  }, [chatId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const setMute = async (body: object) => {
    const token = getToken();
    if (!token) return;
    setOpen(false);
    try {
      const r = await apiFetch(`/api/chats/${chatId}/mute`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = r.ok ? await r.json() : null;
      if (d?.muted_until) {
        setMuted(true);
        setForever(!!d.forever);
        setUntilLabel(d.forever ? "" : new Date(d.muted_until).toLocaleString());
      } else {
        setMuted(false);
        setForever(false);
        setUntilLabel("");
      }
    } catch { /* ignore */ }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`p-2.5 sm:p-2 transition-colors active:scale-95 ${
          muted ? "text-amber-500" : "text-gray-600 dark:text-white/60 hover:text-[#8b5cf6]"
        }`}
        title={muted
          ? `${t("mute.offTitle")} (${forever ? t("mute.forever") : untilLabel})`
          : t("mute.onTitle")}
      >
        {muted ? <BellOff size={19} className="sm:w-5 sm:h-5" /> : <Bell size={19} className="sm:w-5 sm:h-5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#1e1e1e] shadow-xl py-1">
          <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-white/40">
            {t("mute.onTitle")} {muted && <span className="normal-case font-normal">· {forever ? t("mute.offForever") : t("mute.offUntil", { time: untilLabel })}</span>}
          </p>
          {muted && (
            <button
              onClick={() => setMute({ minutes: null, forever: false })}
              className="w-full text-left px-3 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t("mute.turnOn")}
            </button>
          )}
          {PRESETS.map((p) => (
            <button
              key={p.labelKey}
              onClick={() => setMute(p.forever ? { forever: true } : { minutes: p.minutes })}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-white/80 hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
