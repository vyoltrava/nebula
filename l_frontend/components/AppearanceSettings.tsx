"use client";

/**
 * Секция «нешний вид» для страницы настроек (классика + Nebula).
 * Тема + быстрая реакция (двойной тап по сообщению).
 * еакция хранится per-account: quick_reaction_<userId>.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Monitor, Moon, SmilePlus, Sun, X, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { useQuickReaction } from "@/lib/useQuickReaction";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";

type Mode = "light" | "dark" | "system";

type Sticker = { id: number | string; type?: string; content: string };
type StickerPack = { id?: number | string; name?: string; min_level?: number; locked?: boolean; stickers?: Sticker[] };

function reactionSrc(content: string) {
  if (!content) return "";
  if (content.startsWith("http") || content.startsWith("data:") || content.startsWith("blob:")) return content;
  if (content.startsWith("/")) return mediaUrl(content);
  if (content.includes("/") || content.includes(".")) return mediaUrl(content);
  return content;
}

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const { reaction: quickReaction, save: saveReaction, clear: clearReaction, EMOJIS } = useQuickReaction();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [activePackTab, setActivePackTab] = useState(0);
  const packsFetchedRef = useRef(false);
  const [userLevel, setUserLevel] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!pickerOpen || packsFetchedRef.current) return;
    packsFetchedRef.current = true;
    const token = getToken();
    if (!token) return;
    Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([packs, me]) => {
      setStickerPacks(Array.isArray(packs) ? packs : []);
      if (me?.level != null) setUserLevel(Number(me.level) || 0);
    });
  }, [pickerOpen]);

  const modes: { id: Mode; label: string; icon: LucideIcon }[] = [
    { id: "light", label: t("settings.themeLight"), icon: Sun },
    { id: "dark", label: t("settings.themeDark"), icon: Moon },
    { id: "system", label: t("settings.themeSystem"), icon: Monitor },
  ];

  const activeMode: Mode =
    theme === "light" || theme === "dark" || theme === "system" ? (theme as Mode) : "system";

  const preview =
    quickReaction == null ? null :
    quickReaction.type === "emoji" ? (
      <span className="text-2xl leading-none">{quickReaction.content}</span>
    ) : (
      <img
        src={reactionSrc(quickReaction.content)}
        alt=""
        className="w-8 h-8 object-contain rounded-md bg-gray-100 dark:bg-white/5"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-ivory p-4 transition-colors duration-300 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{t("settings.appearance")}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">
            {resolvedTheme === "dark" ? t("settings.themeDark") : resolvedTheme === "light" ? t("settings.themeLight") : t("settings.themeSystem")}
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div role="radiogroup" aria-label={t("settings.appearance")} className="grid grid-cols-3 gap-2 rounded-xl border border-gray-200 bg-gray-100/60 p-1.5 transition-colors duration-300 dark:border-white/10 dark:bg-black/20">
        {modes.map((m) => {
          const Icon = m.icon;
          const active = mounted && activeMode === m.id;
          return (
            <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => setTheme(m.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-xs font-medium transition-all duration-300 ${
                active ? "bg-[#8b5cf6] text-white shadow-sm" : "text-gray-500 hover:bg-white hover:text-gray-900 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              }`}>
              <Icon size={18} />
              {m.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-ivory dark:bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 mb-1">
          <SmilePlus size={18} className="text-amber-500 shrink-0" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t("messages.quickReaction")}</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-white/40 mb-3">войной тап по сообщению ставит эту реакцию</p>

        <button type="button" onClick={() => { setActivePackTab(-1); setPickerOpen(true); }}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors text-left">
          <span className="text-sm text-gray-900 dark:text-white flex items-center gap-3 min-w-0">
            {preview ? (
              <>
                <span className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-white dark:bg-white/10 border border-line dark:border-white/10">{preview}</span>
                <span className="truncate text-xs text-gray-500 dark:text-white/50">{quickReaction?.type === "sticker" ? "Стикер" : "модзи"}</span>
              </>
            ) : (
              <span className="text-gray-500 dark:text-white/50">ыбрать реакцию</span>
            )}
          </span>
          <ChevronDown size={14} className="text-gray-500 dark:text-white/40 shrink-0" />
        </button>

        {quickReaction && (
          <button type="button" onClick={() => clearReaction()} className="mt-2 text-xs text-red-500 hover:text-red-600 transition-colors">
            Сбросить реакцию
          </button>
        )}
      </div>

      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
          <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
            <div className="w-full max-w-sm max-h-[80vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
              <div className="shrink-0 p-3 pb-2 border-b border-line dark:border-white/10">
                <div className="flex items-center justify-between mb-2 px-1">
                  <p className="text-xs font-bold text-gray-600 dark:text-white/60">{t("messages.quickReaction")}</p>
                  <button type="button" onClick={() => setPickerOpen(false)} className="text-gray-500 dark:text-white/40 hover:text-gray-900 dark:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
                  <button type="button" onClick={() => setActivePackTab(-1)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                      activePackTab === -1 ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-white/10"
                    }`}>модзи</button>
                  {stickerPacks.map((pack, i) => {
                    const locked = (pack.min_level || 0) > userLevel || !!pack.locked;
                    return (
                      <button key={pack.id ?? i} type="button" onClick={() => setActivePackTab(i)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                          activePackTab === i ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50"
                        }`}>
                        {locked && <Lock size={10} className="text-yellow-600 dark:text-yellow-400" />}
                        {pack.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 min-h-0">
                {activePackTab === -1 ? (
                  <div className="grid grid-cols-5 gap-2">
                    {EMOJIS.map((e) => {
                      const isActive = quickReaction?.type === "emoji" && quickReaction?.content === e;
                      return (
                        <button key={e} type="button" onClick={() => { saveReaction({ type: "emoji", content: e }); setPickerOpen(false); }}
                          className={`text-2xl w-11 h-11 rounded-xl transition-colors flex items-center justify-center ${
                            isActive ? "ring-2 ring-[#8b5cf6] bg-[#8b5cf6]/20" : "hover:bg-gray-200 dark:hover:bg-white/10"
                          }`}>{e}</button>
                      );
                    })}
                    <button type="button" onClick={() => { clearReaction(); setPickerOpen(false); }}
                      className="text-[11px] font-medium text-red-500 rounded-xl hover:bg-red-500/10 transition-colors flex items-center justify-center">чистить</button>
                  </div>
                ) : stickerPacks.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500 dark:text-white/40">агрузка паков...</div>
                ) : stickerPacks[activePackTab] ? (
                  ((stickerPacks[activePackTab].min_level || 0) > userLevel || stickerPacks[activePackTab].locked) ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                        <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">ак заблокирован</p>
                      <p className="text-[11px] text-gray-500 dark:text-white/40 max-w-[220px]">оступен с уровня {stickerPacks[activePackTab].min_level}.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-6 gap-1.5">
                      {(stickerPacks[activePackTab].stickers || []).map((st: Sticker) => {
                        const type = st.type === "image" ? "sticker" : "emoji";
                        const content = st.content || "";
                        const stickerId = type === "sticker" ? Number(st.id) : undefined;
                        const isActive = quickReaction?.type === type && quickReaction?.content === content && quickReaction?.stickerId === stickerId;
                        return (
                          <button key={st.id} type="button" onClick={() => { saveReaction({ type, content, stickerId }); setPickerOpen(false); }}
                            className={`aspect-square flex items-center justify-center rounded-xl transition-all ${
                              isActive ? "ring-2 ring-[#8b5cf6] bg-[#8b5cf6]/20" : "hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90"
                            }`} title={type === "emoji" ? "модзи" : "Стикер"}>
                            {type === "emoji" ? (
                              <span className="text-2xl">{content}</span>
                            ) : (
                              <img src={reactionSrc(content)} alt="" className="w-10 h-10 object-contain" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="py-8 text-center text-gray-600 dark:text-white/50 text-sm">
                    {stickerPacks.length === 0 ? "ет доступных паков" : "ет данных"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-gray-500 dark:text-white/40">{t("settings.appearanceHint")}</p>
    </div>
  );
}
