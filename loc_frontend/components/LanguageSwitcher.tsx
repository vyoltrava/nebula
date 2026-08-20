"use client";

import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Globe } from "lucide-react";
import type { Locale } from "@/lib/i18n";

const labels: Record<Locale, "lang.ru" | "lang.en"> = {
  ru: "lang.ru",
  en: "lang.en",
};

const flags: Record<Locale, string> = {
  ru: "🇷🇺",
  en: "🇬🇧",
};

export function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[#B9B8BD] flex items-center gap-1.5">
        <Globe size={12} />
        {t("lang.label")}
      </label>
      <div className="inline-flex border border-white/15 rounded-lg overflow-hidden bg-[#1C1C1F] p-1">
        {locales.map((code) => {
          const isActive = locale === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                isActive 
                  ? "bg-[#8b5cf6] text-white shadow-lg shadow-[#8b5cf6]/20" 
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{flags[code]}</span>
              <span>{t(labels[code])}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}