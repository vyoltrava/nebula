"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Smartphone, Monitor, AlertCircle, Info } from "lucide-react";
import { enablePush, disablePush, isPushSubscribed, isPushSupported, getPushEnvironment } from "@/lib/push";
import { getToken } from "@/lib/auth";

/* Тонкий Zune-тумблер */
function ZuneToggle({ on, onChange, busy = false }: { on: boolean; onChange: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      className={`relative shrink-0 w-11 h-[18px] rounded-full transition-all ${
        on ? "bg-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.5)]" : "bg-white/10 border border-white/20"
      } ${busy ? "opacity-40" : ""}`}
    >
      {busy ? (
        <Loader2 size={10} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white animate-spin" />
      ) : (
        <span
          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
            on ? "left-[25px]" : "left-[2px]"
          }`}
        />
      )}
    </button>
  );
}

export function PushSettings() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"checking" | "ok" | "denied" | "unsupported">("checking");
  const [lastError, setLastError] = useState<string | null>(null);
  const env = getPushEnvironment();

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
    setLastError(null);
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
        } else {
          setLastError(res.error || "unknown");
          if (res.error === "NotSupportedError" && env.isIOS && !env.isStandalone) {
            setStatus("unsupported");
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // Браузер не поддерживает
  if (status === "unsupported") {
    return (
      <div className="py-4 border-b border-white/10">
        <div className="flex items-start gap-3">
          <BellOff size={14} className="text-white/40 mt-1 shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/50 mb-1.5">не поддерживается</p>
            <p className="text-xs text-white/50 leading-relaxed">
              {env.isIOS && !env.isStandalone
                ? "на iphone уведомления работают только если открыть сайт с домашнего экрана (safari → поделиться → «на экран домой»)."
                : "ваш браузер не поддерживает web push api. попробуйте chrome, firefox или edge."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ⚠️ In-app browser */}
      {env.isInApp && (
        <div className="py-4 border-b border-amber-500/20">
          <div className="flex items-start gap-3">
            <Info size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 mb-1.5">in-app browser</p>
              <p className="text-xs text-white/55 leading-relaxed">
                сайт открыт во встроенном браузере (telegram/vk). открой в <b className="text-white">chrome</b> или <b className="text-white">safari</b>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🍏 iOS not standalone */}
      {env.isIOS && !env.isStandalone && (
        <div className="py-4 border-b border-blue-500/20">
          <div className="flex items-start gap-3">
            <Smartphone size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400/80 mb-1.5">ios · add to home</p>
              <p className="text-xs text-white/55 leading-relaxed">
                уведомления работают только с домашнего экрана: safari → «поделиться» → <b className="text-white">«на экран домой»</b>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Главный переключатель — строка в списке */}
      <div className="flex items-center justify-between gap-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Bell size={16} className={subscribed ? "text-[#a855f7]" : "text-white/40"} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">
              {subscribed ? "push notifications · on" : "push notifications"}
            </p>
            <p className="text-xs text-white/55 truncate">
              {subscribed ? "получаю уведомления" : "получай даже когда сайт закрыт"}
            </p>
          </div>
        </div>
        <ZuneToggle on={subscribed} onChange={toggle} busy={busy} />
      </div>

      {/* ✅ Статус: где работают пуши */}
      {subscribed && (
        <div className="flex flex-wrap gap-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Smartphone size={12} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/50">mobile</span>
            <Check size={11} className="text-emerald-400" />
          </div>
          <div className="flex items-center gap-2">
            <Monitor size={12} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/50">desktop</span>
            <Check size={11} className="text-emerald-400" />
          </div>
        </div>
      )}

      {/* 🆕 Реальная ошибка */}
      {lastError && (
        <div className="py-4 border-b border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-red-400/80 mb-1.5">error</p>
              <p className="text-xs text-white/55 font-mono break-all mb-1">{lastError}</p>
              {lastError === "NotSupportedError" && (
                <p className="text-[11px] text-white/40 mt-1">
                  {env.isIOS ? "на iphone пуши только из приложения с домашнего экрана." : "web push недоступен в этом контексте."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ❌ Браузер запретил */}
      {status === "denied" && (
        <div className="py-4 border-b border-amber-500/20">
          <div className="flex items-start gap-3">
            <BellOff size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400/80 mb-1.5">blocked</p>
              <p className="text-xs text-white/55 leading-relaxed">
                {env.isIOS
                  ? "настройки iphone → уведомления → найти trelod → включить."
                  : "иконка 🔒 слева от адресной строки → «настройки сайта» → уведомления → разрешить."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Подсказка iOS */}
      {subscribed && env.isIOS && (
        <p className="pt-4 text-[10px] uppercase tracking-[0.2em] text-white/30 leading-relaxed">
          ios: пуши приходят только пока приложение открыто с домашнего экрана.
        </p>
      )}
    </div>
  );
}