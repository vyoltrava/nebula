"use client";
// 📢 Модалка создания канала (изолированная система каналов, /api/channels)
import { useState } from "react";
import { Megaphone, X, Globe, Lock, AtSign, Loader2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

const API = process.env.NEXT_PUBLIC_API_URL;

const SLUG_RE = /^[a-z0-9_]{5,32}$/;

export function CreateChannelModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slugWithAt: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cleanSlug = slug.replace(/^@/, "").toLowerCase();
  const slugValid = SLUG_RE.test(cleanSlug);
  const slugTouched = slug.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim()) { setError(t("channels.needTitle") || "Введите название канала"); return; }
    if (!slugValid) {
      setError(t("channels.badSlug") || "Ссылка: латиница, цифры, '_', 5-32 символа");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/channels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          custom_slug: cleanSlug,
          is_public: isPublic,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.channel?.custom_slug) {
        onCreated(data.channel.custom_slug);
      } else {
        setError(data.detail || t("channels.createFailed") || "Не удалось создать канал");
      }
    } catch {
      setError(t("common.networkError") || "Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[2000]" onClick={onClose} />
      <div className="fixed inset-0 z-[2001] flex items-center justify-center p-4 pointer-events-none">
        <form
          onSubmit={submit}
          className="w-full max-w-md bg-paper dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-200 overflow-hidden"
        >
          {/* Шапка */}
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] flex items-center justify-center shrink-0">
              <Megaphone size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 dark:text-white text-sm">
                {t("messages.createChannel") || "Создать канал"}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-white/40">
                {t("channels.subtitle") || "Вещание для подписчиков"}
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Название */}
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1 block">
                {t("channels.title") || "Название"}
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                autoFocus
                placeholder={t("channels.titlePlaceholder") || "Мой канал"}
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            {/* Ссылка на канал */}
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1 block">
                {t("channels.slug") || "Ссылка на канал"}
              </label>
              <div className="relative">
                <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-white/40" />
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  maxLength={33}
                  placeholder="my_channel"
                  className={`w-full pl-8 pr-3 py-2.5 rounded-xl border bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none ${
                    !slugTouched
                      ? "border-line dark:border-white/15"
                      : slugValid
                      ? "border-green-500/60 focus:border-green-500"
                      : "border-red-500/60 focus:border-red-500"
                  }`}
                />
              </div>
              <p className={`text-[11px] mt-1 ${slugTouched && !slugValid ? "text-red-500 dark:text-red-400" : "text-gray-500 dark:text-white/40"}`}>
                {t("channels.slugHint") || "Латиница, цифры и «_», 5-32 символа"}
              </p>
            </div>
            {/* Описание */}
            <div>
              <label className="text-xs font-bold text-gray-600 dark:text-white/60 mb-1 block">
                {t("channels.description") || "Описание"}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={t("channels.descPlaceholder") || "О чём канал?"}
                className="w-full px-3 py-2.5 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] resize-none"
              />
            </div>

            {/* Публичный / приватный */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  isPublic
                    ? "bg-[#8b5cf6]/15 border-[#8b5cf6]/50 text-[#8b5cf6]"
                    : "border-line dark:border-white/15 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5"
                }`}
              >
                <Globe size={15} /> {t("channels.public") || "Публичный"}
              </button>
              <button
                type="button"
                onClick={() => setIsPublic(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  !isPublic
                    ? "bg-[#8b5cf6]/15 border-[#8b5cf6]/50 text-[#8b5cf6]"
                    : "border-line dark:border-white/15 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5"
                }`}
              >
                <Lock size={15} /> {t("channels.private") || "Приватный"}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-white/40">
              {isPublic
                ? t("channels.publicHint") || "Любой сможет подписаться сразу"
                : t("channels.privateHint") || "Подписка — по заявке с одобрением или инвайт-ссылке"}
            </p>
            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Кнопка */}
          <div className="p-4 pt-0">
            <button
              type="submit"
              disabled={busy || !title.trim() || !slugValid}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Megaphone size={16} />}
              {busy ? (t("channels.creating") || "Создание...") : (t("channels.create") || "Создать канал")}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}