"use client";

import { useEffect, useState } from "react";
import { Ban, ShieldAlert } from "lucide-react";
import { onBan } from "@/lib/ban";
import { clearToken } from "@/lib/auth";

export function BanOverlay() {
  const [banned, setBanned] = useState(false);

  useEffect(() => {
    return onBan(() => setBanned(true));
  }, []);

  if (!banned) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md">
      <div className="relative max-w-md w-full mx-4 border-2 border-red-500/50 rounded-2xl bg-gradient-to-b from-red-950/90 to-black/95 p-8 shadow-2xl shadow-red-500/20">
        {/* Декоративные линии */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-red-500/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative flex flex-col items-center text-center gap-4">
          {/* Иконка */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg shadow-red-500/50 animate-pulse">
            <Ban size={40} className="text-white" />
          </div>

          {/* Заголовок */}
          <div>
            <h1 className="text-3xl font-black text-red-400 tracking-widest uppercase mb-2">
              Аккаунт заблокирован
            </h1>
            <div className="h-1 w-24 mx-auto bg-gradient-to-r from-transparent via-red-500 to-transparent" />
          </div>

          {/* Сообщение */}
          <p className="text-white/70 text-sm leading-relaxed mt-2">
            Ваш аккаунт был заблокирован администрацией за нарушение правил сообщества.
          </p>

          {/* Причина */}
          <div className="w-full bg-red-950/40 border border-red-500/30 rounded-lg p-4 mt-2">
            <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
              <ShieldAlert size={14} />
              <span>Статус аккаунта</span>
            </div>
            <p className="text-white/90 text-sm font-semibold">BANNED</p>
            <p className="text-white/50 text-xs mt-2">
              Если вы считаете, что блокировка произошла по ошибке, свяжитесь с администрацией.
            </p>
          </div>

          {/* Нижний текст */}
          <p className="text-white/40 text-xs mt-4">
            trelod • Система модерации
          </p>
        </div>
      </div>
    </div>
  );
}