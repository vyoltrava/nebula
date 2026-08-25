"use client";

import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Globe } from "lucide-react";
import type { Locale } from "@/lib/i18n";

const labels: Record<Locale, "lang.uk" | "lang.ru" | "lang.en"> = {
  uk: "lang.uk",
  ru: "lang.ru",
  en: "lang.en",
};

// 👇 Добавляем проп variant
export function LanguageSwitcher({ variant = "default" }: { variant?: "default" | "compact" }) {
  const { locale, setLocale, locales, t } = useI18n();

  // 🎯 КОМПАКТНЫЙ РЕЖИМ (для страницы входа/регистрации)
  if (variant === "compact") {
    return (
      <div className="flex items-center justify-center gap-1 bg-gray-100 dark:bg-white/5 rounded-lg p-1 border border-gray-200 dark:border-white/10">
        {locales.map((code) => {
          const isActive = locale === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                isActive
                  ? "bg-[#8b5cf6] text-white shadow-sm"
                  : "text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5"
              }`}
            >
              {t(labels[code])}
            </button>
          );
        })}
      </div>
    );
  }

  // 🎯 СТАНДАРТНЫЙ РЕЖИМ (для настроек и сайдбара)
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-[#B9B8BD] uppercase tracking-wider">
        <Globe size={14} className="text-[#7B3FF2]" />
        {t("lang.label")}
      </label>
      <div className="inline-flex bg-gray-100 dark:bg-[#1C1C1F] border border-gray-200 dark:border-white/10 rounded-xl p-1 shadow-sm">
        {locales.map((code) => {
          const isActive = locale === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={`relative flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ease-out ${
                isActive
                  ? "bg-[#7B3FF2] text-white shadow-lg shadow-[#7B3FF2]/25 ring-1 ring-[#7B3FF2]/50"
                  : "text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/5"
              }`}
            >
              {t(labels[code])}
            </button>
          );
        })}
      </div>
    </div>
  );
}