import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isLocale, translate, type Locale } from "./i18n";

function currentLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function isOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

export function lastSeenText(lastSeen?: string | null): string {
  const locale = currentLocale();
  if (!lastSeen) return translate(locale, "common.offline");
  if (isOnline(lastSeen)) return translate(locale, "messages.online");
  const diff = Date.now() - new Date(lastSeen).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return translate(locale, "common.wasMinAgo", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return translate(locale, "common.wasHourAgo", { n: hours });
  return `${translate(locale, "common.offline")} · ${new Date(lastSeen).toLocaleDateString(locale === "en" ? "en-US" : "ru-RU")}`;
}
