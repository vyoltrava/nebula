"use client";
import { useEffect, useState } from "react";
import { Zap, EyeOff } from "lucide-react";
import { getToken } from "@/lib/auth";

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
      .then((d) => { if (d) { setEnabled(d.enabled); setBroadcast(d.broadcast); } setLoaded(true); })
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

  const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 shrink-0 rounded-full transition-colors ${on ? "bg-[#8b5cf6]" : "bg-white/15"}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );

  if (!loaded) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <Zap size={14} className="text-[#8b5cf6]" /> Живые сообщения
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">Показывать текст собеседников, пока они печатают</p>
        </div>
        <Toggle on={enabled} onChange={(v) => { setEnabled(v); update({ enabled: v }); }} />
      </div>

      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-1.5">
            <EyeOff size={14} className="text-[#8b5cf6]" /> Транслировать мой набор
          </p>
          <p className="text-[11px] text-white/40 mt-0.5">Выключи — и никто не увидит твой текст во время набора</p>
        </div>
        <Toggle on={broadcast} onChange={(v) => { setBroadcast(v); update({ broadcast: v }); }} />
      </div>
    </div>
  );
}