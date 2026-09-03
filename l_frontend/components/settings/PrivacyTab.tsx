// components/settings/PrivacyTab.tsx
// 🛡 ПОЛНОЦЕННАЯ ВКЛАДКА «Приватность» (аналог Twitter/X).
// Оптимистичные обновления: UI меняется мгновенно, при ошибке PATCH — откат.
'use client';

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";
import {
  Lock, MessageCircle, Phone, MessageSquare, Users, EyeOff, Mail, Loader2, ShieldCheck,
} from "lucide-react";
import {
  validatePrivacyUpdate,
  AUDIENCE_OPTIONS,
  COMMENT_OPTIONS,
  type PrivacySettings as PrivacyForm,
  type PrivacyField,
} from "@/lib/validators/privacy";

const AUDIENCE_LABELS: Record<string, string> = {
  everyone: "Все",
  followers: "Подписчики",
  following: "Те, на кого подписан я",
  nobody: "Никто",
};

const COMMENT_LABELS: Record<string, string> = {
  everyone: "Все",
  followers: "Подписчики",
  following: "Те, на кого подписан я",
  mentioned: "Только упомянутые",
};

const DEFAULTS: PrivacyForm = {
  is_private: false,
  allow_messages: "everyone",
  allow_calls: "everyone",
  allow_comments: "everyone",
  hide_following: false,
  hide_followers: false,
  search_hide_email: false,
};

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex w-10 h-6 rounded-full transition-colors shrink-0 ${
        on ? "bg-[#8b5cf6]" : "bg-gray-300 dark:bg-white/20"
      }`}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? "translateX(16px)" : "translateX(0)" }}
      />
    </span>
  );
}

export function PrivacyTab() {
  const [form, setForm] = useState<PrivacyForm>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [savingKey, setSavingKey] = useState<PrivacyField | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch("/api/me/privacy", { headers: { Authorization: `Bearer ${token}` } })
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setForm({ ...DEFAULTS, ...d });
      })
      .finally(() => setLoaded(true))
      .catch(() => setLoaded(true));
  }, []);

  /** Оптимистичное обновление: применяем сразу, откатываем при ошибке */
  const update = async (key: PrivacyField, value: boolean | string) => {
    const prev = form;
    // 1) валидация схемы
    const check = validatePrivacyUpdate({ [key]: value });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    // 2) optimistic update
    setForm((f) => ({ ...f, [key]: value } as PrivacyForm));
    setSavingKey(key);
    setError(null);
    try {
      const token = getToken();
      const r = await apiFetch("/api/me/privacy", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(check.data),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => null);
        throw new Error(err?.detail || "Ошибка сохранения");
      }
    } catch (e: any) {
      // 3) rollback
      setForm(prev);
      setError(e?.message || "Ошибка сохранения");
    } finally {
      setSavingKey(null);
    }
  };

  const toggles: { key: PrivacyField; icon: any; title: string; hint: string }[] = [
    {
      key: "is_private", icon: Lock,
      title: "Приватный аккаунт",
      hint: "Ваш профиль и записи видны только подписчикам. Неавторизованные увидят замок.",
    },
    { key: "hide_following", icon: Users, title: "Скрыть, на кого я подписан", hint: "Список подписок будет виден только вам" },
    { key: "hide_followers", icon: EyeOff, title: "Скрыть моих подписчиков", hint: "Список подписчиков будет виден только вам" },
    { key: "search_hide_email", icon: Mail, title: "Исключить из поиска по email", hint: "Вас нельзя будет найти по email-адресу" },
  ];

  const selects: { key: PrivacyField; icon: any; title: string; labels: Record<string, string>; options: readonly string[] }[] = [
    { key: "allow_messages", icon: MessageCircle, title: "Кто может отправлять вам сообщения?", labels: AUDIENCE_LABELS, options: AUDIENCE_OPTIONS },
    { key: "allow_calls", icon: Phone, title: "Кто может звонить вам?", labels: AUDIENCE_LABELS, options: AUDIENCE_OPTIONS },
    { key: "allow_comments", icon: MessageSquare, title: "Кто может комментировать ваши записи?", labels: COMMENT_LABELS, options: COMMENT_OPTIONS },
  ];

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 dark:text-white/40">
        <Loader2 size={18} className="animate-spin mr-2" /> Загрузка…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm px-4 py-2.5">
          {error}
        </div>
      )}

      {/* А. Аудитория профиля */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-white/40 mb-2 px-1">
          Аудитория профиля
        </h3>
        <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {toggles.map(({ key, icon: Icon, title, hint }) => {
            const isOn = !!(form as unknown as Record<string, unknown>)[key];
            return (
              <button
                key={key}
                onClick={() => update(key, !isOn)}
                disabled={savingKey === key}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/5 transition-colors"
              >
                <Icon size={17} className={isOn ? "text-[#8b5cf6]" : "text-gray-500 dark:text-white/40 shrink-0"} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                  <span className="block text-[11px] text-gray-500 dark:text-white/40 mt-0.5">{hint}</span>
                </span>
                {savingKey === key ? <Loader2 size={15} className="animate-spin text-gray-400" /> : <Toggle on={isOn} />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Б. Читаемость и связь */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-white/40 mb-2 px-1">
          Читаемость и связь
        </h3>
        <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {selects.map(({ key, icon: Icon, title, labels, options }) => (
            <div key={key} className="px-4 py-3.5">
              <div className="flex items-center gap-3 mb-2.5">
                <Icon size={17} className="text-gray-500 dark:text-white/40 shrink-0" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                {savingKey === key && <Loader2 size={14} className="animate-spin text-gray-400 ml-auto" />}
              </div>
              <div className="flex gap-1.5 flex-wrap pl-7">
                {options.map((o) => (
                  <button
                    key={o}
                    onClick={() => update(key, o)}
                    disabled={savingKey === key}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors active:scale-95 ${
                      (form as unknown as Record<string, unknown>)[key] === o
                        ? "bg-[#8b5cf6] text-white"
                        : "bg-black/5 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/20"
                    }`}
                  >
                    {labels[o] || o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/30 px-1">
        <ShieldCheck size={12} />
        Все ограничения проверяются на сервере — их нельзя обойти изменением интерфейса.
      </p>
    </div>
  );
}
