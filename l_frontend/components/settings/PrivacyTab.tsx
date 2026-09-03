// components/settings/PrivacyTab.tsx
// 🛡 ПОЛНОЦЕННАЯ ВКЛАДКА «Приватность» (аналог Twitter/X).
// Оптимистичные обновления: UI меняется мгновенно, при ошибке PATCH — откат.
'use client';

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";
import { getToken } from "@/lib/auth";
import {
  Lock, MessageCircle, Phone, MessageSquare, Users, EyeOff, Loader2, ShieldCheck,
} from "lucide-react";
import {
  validatePrivacyUpdate,
  AUDIENCE_OPTIONS,
  COMMENT_OPTIONS,
  type PrivacySettings as PrivacyForm,
  type PrivacyField,
} from "@/lib/validators/privacy";
import { useI18n } from "@/lib/i18n/LanguageProvider";

const OPTION_LABEL_KEYS: Record<string, string> = {
  everyone: "privacy.optAll",
  followers: "privacy.optFollowers",
  following: "privacy.optFollowing",
  nobody: "privacy.optNobody",
  mentioned: "privacy.optMentioned",
};

const DEFAULTS: PrivacyForm = {
  is_private: false,
  allow_messages: "everyone",
  allow_calls: "everyone",
  allow_comments: "everyone",
  hide_following: false,
  hide_followers: false,
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
  const { t } = useI18n();
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
      setError(e?.message || t("privacy.saveError"));
    } finally {
      setSavingKey(null);
    }
  };

  const toggles: { key: PrivacyField; icon: any; title: string; hint: string }[] = [
    {
      key: "is_private", icon: Lock,
      title: t("privacy.privateAccount"),
      hint: t("privacy.privateAccountHint"),
    },
    { key: "hide_following", icon: Users, title: t("privacy.hideFollowing"), hint: t("privacy.hideFollowingHint") },
    { key: "hide_followers", icon: EyeOff, title: t("privacy.hideFollowers"), hint: t("privacy.hideFollowersHint") },
  ];

  const selects: { key: PrivacyField; icon: any; title: string; options: readonly string[] }[] = [
    { key: "allow_messages", icon: MessageCircle, title: t("privacy.whoMessages"), options: AUDIENCE_OPTIONS },
    { key: "allow_calls", icon: Phone, title: t("privacy.whoCalls"), options: AUDIENCE_OPTIONS },
    { key: "allow_comments", icon: MessageSquare, title: t("privacy.whoComments"), options: COMMENT_OPTIONS },
  ];

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-10 text-gray-500 dark:text-white/40">
        <Loader2 size={18} className="animate-spin mr-2" /> {t("common.loading")}
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
          {t("privacy.audienceTitle")}
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
          {t("privacy.readabilityTitle")}
        </h3>
        <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
          {selects.map(({ key, icon: Icon, title, options }) => (
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
                    {t((OPTION_LABEL_KEYS[o] || o) as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-white/30 px-1">
        <ShieldCheck size={12} />
        {t("privacy.serverEnforced")}
      </p>
    </div>
  );
}
