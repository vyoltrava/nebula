"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Smartphone, Monitor, AlertCircle, Info } from "lucide-react";
import { enablePush, disablePush, isPushSubscribed, isPushSupported, getPushEnvironment } from "@/lib/push";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

function Toggle({ on, onChange, busy = false }: { on: boolean; onChange: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-all ${
        on ? "bg-[#7B3FF2] shadow-[0_0_12px_rgba(123,63,242,0.5)]" : "bg-gray-100 dark:bg-white/10"
      } ${busy ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {busy ? (
        <Loader2 size={12} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-gray-900 dark:text-white animate-spin" />
      ) : (
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            on ? "left-[22px]" : "left-0.5"
          }`}
        />
      )}
    </button>
  );
}

export function PushSettings() {
  const { t } = useI18n();
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
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0">
            <BellOff size={18} className="text-[#B9B8BD]" />
          </div>
          <div>
            <p className="text-sm font-medium">{t("push.unsupported")}</p>
            <p className="text-xs text-[#B9B8BD] mt-1 leading-relaxed">
              {env.isIOS && !env.isStandalone
                ? t("push.iosHome")
                : t("push.noApi")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ⚠️ In-app browser */}
      {env.isInApp && (
        <div className="p-4 rounded-lg bg-[#F39C12]/5 border border-[#F39C12]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F39C12]/15 flex items-center justify-center shrink-0">
              <Info size={18} className="text-[#F39C12]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#F39C12]">{t("push.inApp")}</p>
              <p className="text-xs text-[#B9B8BD] mt-1 leading-relaxed">
                {t("push.inAppHint")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 🍏 iOS not standalone */}
      {env.isIOS && !env.isStandalone && (
        <div className="p-4 rounded-lg bg-[#3498DB]/5 border border-[#3498DB]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#3498DB]/15 flex items-center justify-center shrink-0">
              <Smartphone size={18} className="text-[#3498DB]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#3498DB]">{t("push.iosAdd")}</p>
              <p className="text-xs text-[#B9B8BD] mt-1 leading-relaxed">
                {t("push.iosAddHint")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Главный переключатель */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${subscribed ? "bg-[#7B3FF2]/15" : "bg-gray-100 dark:bg-white/5"}`}>
              <Bell size={18} className={subscribed ? "text-[#7B3FF2]" : "text-[#B9B8BD]"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("push.title")}</p>
              <p className="text-xs text-[#B9B8BD] mt-0.5">
                {subscribed ? t("push.on") : t("push.off")}
              </p>
            </div>
          </div>
          <Toggle on={subscribed} onChange={toggle} busy={busy} />
        </div>

        {/* Статус устройств */}
        {subscribed && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-line dark:border-white/10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#2ECC71]/10 border border-[#2ECC71]/20">
              <Smartphone size={12} className="text-[#2ECC71]" />
              <span className="text-xs text-[#2ECC71]">{t("push.mobile")}</span>
              <Check size={11} className="text-[#2ECC71]" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#2ECC71]/10 border border-[#2ECC71]/20">
              <Monitor size={12} className="text-[#2ECC71]" />
              <span className="text-xs text-[#2ECC71]">{t("push.desktop")}</span>
              <Check size={11} className="text-[#2ECC71]" />
            </div>
          </div>
        )}
      </div>

      {/* 🆕 Реальная ошибка */}
      {lastError && (
        <div className="p-4 rounded-lg bg-[#E74C3C]/5 border border-[#E74C3C]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E74C3C]/15 flex items-center justify-center shrink-0">
              <AlertCircle size={18} className="text-[#E74C3C]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#E74C3C]">{t("common.error")}</p>
              <p className="text-xs text-[#B9B8BD] mt-1 font-mono break-all">{lastError}</p>
              {lastError === "NotSupportedError" && (
                <p className="text-xs text-[#B9B8BD] mt-2 leading-relaxed">
                  {env.isIOS ? t("push.iosOnlyHome") : t("push.webPushUnavailable")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ❌ Браузер запретил */}
      {status === "denied" && (
        <div className="p-4 rounded-lg bg-[#F39C12]/5 border border-[#F39C12]/30">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#F39C12]/15 flex items-center justify-center shrink-0">
              <BellOff size={18} className="text-[#F39C12]" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#F39C12]">{t("push.blocked")}</p>
              <p className="text-xs text-[#B9B8BD] mt-1 leading-relaxed">
                {env.isIOS
                  ? t("push.iosBlocked")
                  : t("push.desktopBlocked")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Подсказка iOS */}
      {subscribed && env.isIOS && (
        <p className="text-xs text-[#B9B8BD] leading-relaxed px-1">
          {t("push.iosOpenHint")}
        </p>
      )}
    </div>
  );
}