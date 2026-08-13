"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Smartphone, Monitor } from "lucide-react";
import { enablePush, disablePush, isPushSubscribed, isPushSupported } from "@/lib/push";
import { getToken } from "@/lib/auth";

export function PushSettings() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"checking" | "ok" | "denied" | "unsupported">("checking");

  useEffect(() => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    isPushSubscribed().then((v) => {
      setSubscribed(v);
      setStatus(v ? "ok" : "checking");
    });
  }, []);

  async function toggle() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush(token);
        setSubscribed(false);
        setStatus("ok");
      } else {
        const res = await enablePush(token);
        if (res.ok) {
          setSubscribed(true);
          setStatus("ok");
        } else if (res.error === "denied") {
          setStatus("denied");
        } else if (res.error === "unsupported") {
          setStatus("unsupported");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Браузер не поддерживает
  if (status === "unsupported") {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <BellOff size={18} className="text-white/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-white/70 font-medium">Не поддерживается</p>
          <p className="text-xs text-white/40 mt-0.5">
            Ваш браузер не поддерживает Web Push API. Попробуйте Chrome, Firefox или Edge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Главный переключатель */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            subscribed ? "bg-[#8b5cf6]/20" : "bg-white/5"
          }`}>
            {subscribed ? (
              <Bell size={18} className="text-[#8b5cf6]" />
            ) : (
              <BellOff size={18} className="text-white/50" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              {subscribed ? "Уведомления включены" : "Включить push-уведомления"}
            </p>
            <p className="text-xs text-white/40 mt-0.5 truncate">
              {subscribed 
                ? "Вы получаете уведомления о новых сообщениях" 
                : "Получайте уведомления даже когда сайт закрыт"}
            </p>
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={busy}
          className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
            subscribed ? "bg-[#8b5cf6]" : "bg-white/20"
          } ${busy ? "opacity-50" : ""}`}
        >
          {busy ? (
            <Loader2 size={14} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
          ) : (
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              subscribed ? "translate-x-6" : "translate-x-1"
            }`} />
          )}
        </button>
      </div>

      {/* Статус: где работают пуши */}
      {subscribed && (
        <div className="flex flex-wrap gap-2 pt-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Smartphone size={13} className="text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Мобильные</span>
            <Check size={11} className="text-emerald-400" />
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Monitor size={13} className="text-emerald-400" />
            <span className="text-xs text-emerald-300 font-medium">Desktop</span>
            <Check size={11} className="text-emerald-400" />
          </div>
        </div>
      )}

      {/* Предупреждение: если браузер запретил */}
      {status === "denied" && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <BellOff size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-200 font-medium">Уведомления заблокированы</p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Разрешите их вручную: иконка замка 🔒 слева от адресной строки → «Настройки сайта» → включите «Уведомления».
            </p>
          </div>
        </div>
      )}

      {/* Подсказка для iOS */}
      {subscribed && (
        <p className="text-[11px] text-white/30 leading-relaxed">
          💡 На iOS уведомления работают только если вы добавили сайт на главный экран через Safari.
        </p>
      )}
    </div>
  );
}