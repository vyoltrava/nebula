"use client";
import { useEffect, useState } from "react";
import { Zap, EyeOff, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";

/* Единый Zune-тумблер (как в SettingsPage) */
function ZuneToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative shrink-0 w-11 h-[18px] rounded-full transition-all ${
        on ? "bg-[#7B3FF2] shadow-[0_0_12px_rgba(123,63,242,0.4)]" : "bg-white/10 border border-white/20"
      }`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all ${
          on ? "left-[25px]" : "left-[2px]"
        }`}
      />
    </button>
  );
}

export function LiveTextSettings() {
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
      <div className="py-5 flex items-center gap-3 text-white/40">
        <Loader2 size={14} className="animate-spin text-[#7B3FF2]" />
        <span className="text-[10px] uppercase tracking-[0.3em]">Загрузка...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Живые сообщения */}
      <div className="flex items-center justify-between gap-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Zap size={15} className={enabled ? "text-[#7B3FF2]" : "text-white/40"} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">Живые сообщения</p>
            <p className="text-xs text-white/55">Показывать текст собеседников, пока они печатают</p>
          </div>
        </div>
        <ZuneToggle
          on={enabled}
          onChange={() => {
            const v = !enabled;
            setEnabled(v);
            update({ enabled: v });
          }}
        />
      </div>

      {/* Транслировать мой набор */}
      <div className="flex items-center justify-between gap-4 py-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <EyeOff size={15} className={broadcast ? "text-[#7B3FF2]" : "text-white/40"} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1">Транслировать мой набор</p>
            <p className="text-xs text-white/55">Никто не увидит мой текст во время набора</p>
          </div>
        </div>
        <ZuneToggle
          on={broadcast}
          onChange={() => {
            const v = !broadcast;
            setBroadcast(v);
            update({ broadcast: v });
          }}
        />
      </div>
    </div>
  );
}