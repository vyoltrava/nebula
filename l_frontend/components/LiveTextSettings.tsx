"use client";
import { useEffect, useState } from "react";
import { Zap, EyeOff, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-all ${
        on ? "bg-[#7B3FF2] shadow-[0_0_12px_rgba(123,63,242,0.5)]" : "bg-gray-100 dark:bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function LiveTextSettings() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(true);
  const [broadcast, setBroadcast] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/live-text-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setEnabled(d.enabled);
          setBroadcast(d.broadcast);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function update(patch: { enabled?: boolean; broadcast?: boolean }) {
    const token = getToken();
    if (!token) return;
    const body = new FormData();
    if (patch.enabled !== undefined) body.append("enabled", String(patch.enabled));
    if (patch.broadcast !== undefined) body.append("broadcast", String(patch.broadcast));
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/live-text-settings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).catch(() => {});
  }

  if (!loaded) {
    return (
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center gap-3">
        <Loader2 size={16} className="animate-spin text-[#7B3FF2]" />
        <span className="text-sm text-[#B9B8BD]">{t("common.loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Живые сообщения */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${enabled ? "bg-[#7B3FF2]/15" : "bg-gray-100 dark:bg-white/5"}`}>
              <Zap size={18} className={enabled ? "text-[#7B3FF2]" : "text-[#B9B8BD]"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("live.title")}</p>
              <p className="text-xs text-[#B9B8BD] mt-0.5">{t("live.hint")}</p>
            </div>
          </div>
          <Toggle
            on={enabled}
            onChange={() => {
              const v = !enabled;
              setEnabled(v);
              update({ enabled: v });
            }}
          />
        </div>
      </div>

      {/* Скрыть мой набор */}
      <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${broadcast ? "bg-[#7B3FF2]/15" : "bg-gray-100 dark:bg-white/5"}`}>
              <EyeOff size={18} className={broadcast ? "text-[#7B3FF2]" : "text-[#B9B8BD]"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("live.hideMine")}</p>
              <p className="text-xs text-[#B9B8BD] mt-0.5">{t("live.hideHint")}</p>
            </div>
          </div>
          <Toggle
            on={broadcast}
            onChange={() => {
              const v = !broadcast;
              setBroadcast(v);
              update({ broadcast: v });
            }}
          />
        </div>
      </div>
    </div>
  );
}