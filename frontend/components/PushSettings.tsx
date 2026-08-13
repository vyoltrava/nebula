"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Smartphone, Monitor } from "lucide-react";
import { enablePush, disablePush, isPushSubscribed, isPushSupported, getPushEnvironment } from "@/lib/push";
import { getToken } from "@/lib/auth";

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
          // 🆕 Ловим реальные ошибки Safari (NotSupportedError и т.п.)
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
      <div className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <BellOff size={18} className="text-white/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm text-white/70 font-medium">Не поддерживается</p>
          <p className="text-xs text-white/40 mt-0.5">
            {env.isIOS && !env.isStandalone
              ? "На iPhone уведомления работают только если открыть сайт с домашнего экрана (Safari → Поделиться → На экран «Домой»)."
              : "Ваш браузер не поддерживает Web Push API. Попробуйте Chrome, Firefox или Edge."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ⚠️ Открыто во встроенном браузере */}
      {env.isInApp && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-400 text-sm">⚠️</span>
          <p className="text-xs text-amber-200/80">
            Сайт открыт во встроенном браузере (Telegram/VK и т.п.). Открой его в обычном <b>Chrome</b> или <b>Safari</b> — иначе пуши не заработают.
          </p>
        </div>
      )}

      {/* 🍏 iOS: не в standalone */}
      {env.isIOS && !env.isStandalone && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <span className="text-blue-400 text-sm">🍏</span>
          <p className="text-xs text-blue-200/80">
            На iPhone уведомления работают только с домашнего экрана: Safari → кнопка «Поделиться» → <b>«На экран “Домой”»</b>. Затем открой приложение с иконки и включи пуши там.
          </p>
        </div>
      )}

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

      {/* ✅ Статус: где работают пуши */}
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

      {/* 🆕 Реальная ошибка из Safari */}
      {lastError && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <BellOff size={16} className="text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-200 font-medium">Не удалось включить</p>
            <p className="text-xs text-red-200/70 mt-0.5 font-mono break-all">
              {lastError}
            </p>
            {lastError === "NotSupportedError" && (
              <p className="text-xs text-red-200/70 mt-1">
                {env.isIOS
                  ? "На iPhone пуши доступны только из приложения с домашнего экрана."
                  : "Ваш браузер не поддерживает Web Push в этом контексте."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ❌ Браузер запретил */}
      {status === "denied" && (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <BellOff size={16} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-amber-200 font-medium">Уведомления заблокированы</p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              {env.isIOS
                ? "Настройки iPhone → Уведомления → найти trelod → включить."
                : "Иконка замка 🔒 слева от адресной строки → «Настройки сайта» → включите «Уведомления»."}
            </p>
          </div>
        </div>
      )}

      {/* Подсказка для iOS когда всё ок */}
      {subscribed && env.isIOS && (
        <p className="text-[11px] text-white/30 leading-relaxed">
          💡 На iOS уведомления приходят только пока приложение открыто с домашнего экрана. В фоне iOS может задерживать пуши.
        </p>
      )}
    </div>
  );
}