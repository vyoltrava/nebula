"use client";

import { useEffect, useState } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import { onBan, BanPayload } from "@/lib/ban";
import { clearToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export function BanOverlay() {
  const { t } = useI18n();
  const [banned, setBanned] = useState(false);
  const [payload, setPayload] = useState<BanPayload | undefined>(undefined);

  useEffect(() => {
    return onBan((p) => {
      setPayload(p);
      setBanned(true);
    });
  }, []);

  if (!banned) return null;

  const reason = payload?.reason;
  const until = payload?.until;
  // Красивый формат «до такого» (UTC → локальное)
  const untilLabel = until
    ? (() => {
        const d = new Date(until);
        try {
          return d.toLocaleString();
        } catch {
          return until;
        }
      })()
    : null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative max-w-md w-full mx-4 border-2 border-red-500/50 rounded-2xl bg-gradient-to-b from-red-950/90 to-black/95 p-8 shadow-2xl shadow-red-500/20">
        {/* Декоративные линии */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative flex flex-col items-center text-center gap-4">
          {/* Иконка */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/50 animate-pulse">
            <Ban size={40} className="text-gray-900 dark:text-white" />
          </div>

          {/* Заголовок */}
          <div>
            <h1 className="text-3xl font-black text-red-600 dark:text-red-400 tracking-widest uppercase mb-2">
              {t("ban.title")}
            </h1>
            <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-red-500 to-transparent" />
          </div>

          {/* Сообщение */}
          <p className="text-gray-800 dark:text-white/70 text-sm leading-relaxed mt-2">
            {t("ban.body")}
          </p>

          {/* Причина + срок */}
          <div className="w-full bg-red-950/40 border border-red-500/30 rounded-lg p-4 mt-2">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldAlert size={14} />
              <span>{t("ban.status")}</span>
            </div>
            {reason ? (
              <div className="mb-2">
                <p className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400/80 font-bold">{t("ban.reason")}</p>
                <p className="text-sm font-semibold text-red-900 dark:text-red-300">{reason}</p>
              </div>
            ) : null}
            {untilLabel ? (
              <p className="text-sm font-semibold text-red-900 dark:text-red-300">
                {t("ban.bannedUntil")}: {untilLabel}
              </p>
            ) : (
              <p className="text-sm font-semibold text-red-900 dark:text-red-300">{t("ban.bannedForever")}</p>
            )}
            <p className="text-gray-600 dark:text-white/50 text-xs mt-2">
              {t("ban.appeal")}
            </p>
          </div>

          {/* Выйти */}
          <button
            onClick={() => { clearToken(); window.location.href = "/login"; }}
            className="mt-2 w-full px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/25 transition-colors font-semibold text-sm"
          >
            <span className="flex items-center justify-center gap-2">
              {t("ban.logout")}
            </span>
          </button>

          {/* Нижний текст */}
          <p className="text-gray-500 dark:text-white/40 text-xs mt-4">
            {t("ban.footer")}
          </p>
        </div>
      </div>
    </div>
  );
}