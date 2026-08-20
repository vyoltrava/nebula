"use client";

import { useI18n } from "@/lib/i18n/LanguageProvider";
import type { Locale } from "@/lib/i18n";

const labels: Record<Locale, "lang.ru" | "lang.en"> = {
  ru: "lang.ru",
  en: "lang.en",
};

export function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();

  return (
    <div>
      <label className="block text-xs font-medium text-[#B9B8BD] mb-1.5">{t("lang.label")}</label>
      <div className="flex border border-white/15 rounded-full overflow-hidden bg-white/5">
        {locales.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLocale(code)}
            className={`flex-1 py-2 text-sm font-bold transition-all ${
              locale === code ? "bg-[#8b5cf6] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            {t(labels[code])}
          </button>
        ))}
      </div>
    </div>
  );
}
