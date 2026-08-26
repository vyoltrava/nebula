"use client";

/**
 * 🎨 Секция «Внешний вид» для страницы настроек.
 *
 * Три режима цветовой темы: Светлая / Тёмная / Системная (next-themes).
 * Плюс быстрый переключатель ThemeToggle (Sun/Moon).
 * Гидратация: до монтирования показываем скелет той же высоты,
 * т.к. реальную тему знает только браузер.
 */
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useZuneTheme } from "@/themes/zune";
import { useI18n } from "@/lib/i18n/LanguageProvider";

type Mode = "light" | "dark" | "system";

/* Флаг гидратации без setState-в-эффекте: SSR → false, клиент → true */
const emptySubscribe = () => () => {};

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useI18n();
  const { preference, setPreference } = useZuneTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const modes: { id: Mode; label: string; icon: LucideIcon }[] = [
    { id: "light", label: t("settings.themeLight"), icon: Sun },
    { id: "dark", label: t("settings.themeDark"), icon: Moon },
    { id: "system", label: t("settings.themeSystem"), icon: Monitor },
  ];

  const activeMode: Mode =
    theme === "light" || theme === "dark" || theme === "system"
      ? (theme as Mode)
      : "system";

  return (
    <div className="space-y-5">
      {/* Быстрый переключатель */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-ivory p-4 transition-colors duration-300 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {t("settings.appearance")}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-white/50">
            {resolvedTheme === "dark"
              ? t("settings.themeDark")
              : resolvedTheme === "light"
                ? t("settings.themeLight")
                : t("settings.themeSystem")}
          </p>
        </div>
        <ThemeToggle />
      </div>

      {/* Выбор режима: Светлая / Тёмная / Системная */}
      <div
        role="radiogroup"
        aria-label={t("settings.appearance")}
        className="grid grid-cols-3 gap-2 rounded-xl border border-gray-200 bg-gray-100/60 p-1.5 transition-colors duration-300 dark:border-white/10 dark:bg-black/20"
      >
        {modes.map((m) => {
          const Icon = m.icon;
          const active = mounted && activeMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(m.id)}
              className={`flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-xs font-medium transition-all duration-300 ${
                active
                  ? "bg-[#8b5cf6] text-white shadow-sm"
                  : "text-gray-500 hover:bg-white hover:text-gray-900 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
              }`}
            >
              <Icon size={18} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* 🟣 ТЕМА ОФОРМЛЕНИЯ: Стандартная / Zune Windows Phone */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          Тема оформления
        </p>
        <div
          role="radiogroup"
          aria-label="Тема оформления"
          className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-100/60 p-1.5 transition-colors duration-300 dark:border-white/10 dark:bg-black/20"
        >
          {([
            { id: "standard", label: "Стандартная" },
            { id: "zune", label: "Zune Windows Phone" },
          ] as const).map((opt) => {
            const active = mounted && preference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(opt.id)}
                className={`rounded-lg px-2 py-3 text-xs font-medium transition-all duration-300 ${
                  active
                    ? "bg-[#8b5cf6] text-white shadow-sm"
                    : "text-gray-500 hover:bg-white hover:text-gray-900 dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 dark:text-white/40">
          Zune — чёрный Metro-скин: гигантские overscan-заголовки, плитки,
          кнопки за краем экрана, маджента.{" "}
          <Link
            href="/zune"
            className="font-medium text-[#8b5cf6] hover:underline"
          >
            Демо-экран →
          </Link>
        </p>
      </div>

      <p className="text-xs text-gray-500 dark:text-white/40">
        {t("settings.appearanceHint")}
      </p>
    </div>
  );
}
