// components/settings/PrivacySettings.tsx
// 🛡 Настройки приватности: кто может писать мне и звонить.
'use client';

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";
import { MessageCircle, Phone, ShieldCheck } from "lucide-react";

const OPTIONS = [
  { value: "everyone", label: "Все" },
  { value: "followers", label: "Только подписчики" },
  { value: "nobody", label: "Никто" },
];

type Kind = "allow_messages" | "allow_calls";

export function PrivacySettings() {
  const [settings, setSettings] = useState<Record<Kind, string>>({
    allow_messages: "everyone",
    allow_calls: "everyone",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch("/api/me/privacy", { headers: { Authorization: `Bearer ${token}` } })
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setSettings({ allow_messages: d.allow_messages, allow_calls: d.allow_calls });
      })
      .catch(() => {});
  }, []);

  const update = async (key: Kind, value: string) => {
    const prev = settings;
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(true);
    setMsg(null);
    try {
      const token = getToken();
      const r = await apiFetch("/api/me/privacy", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!r.ok) throw new Error();
      setMsg("Сохранено ✓");
      setTimeout(() => setMsg(null), 2000);
    } catch {
      setSettings(prev);
      setMsg("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: Kind; icon: any; title: string; hint: string }[] = [
    { key: "allow_messages", icon: MessageCircle, title: "Кто может писать мне", hint: "Ограничение действует для личных чатов" },
    { key: "allow_calls", icon: Phone, title: "Кто может звонить мне", hint: "Звонки от запрещённых пользователей будут отклоняться" },
  ];

  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-[#8b5cf6]" />
        <h3 className="font-bold text-gray-900 dark:text-white">Приватность</h3>
        {saving && <span className="text-xs text-gray-500">сохранение…</span>}
        {msg && <span className="text-xs text-green-600 dark:text-green-400">{msg}</span>}
      </div>

      {rows.map(({ key, icon: Icon, title, hint }) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-2">
            <Icon size={15} className="text-gray-500 dark:text-white/50" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => update(key, o.value)}
                disabled={saving}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors active:scale-95 ${
                  settings[key] === o.value
                    ? "bg-[#8b5cf6] text-white"
                    : "bg-black/5 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/20"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1">{hint}</p>
        </div>
      ))}
    </div>
  );
}
