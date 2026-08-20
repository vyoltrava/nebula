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

function locTag(locale: Locale) {
  return locale === "en" ? "en-US" : "ru-RU";
}

export function timeAgo(date: string | Date | undefined): string {
  if (!date) return "";

  let then: Date;
  if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+")) {
    then = new Date(date + "Z");
  } else {
    then = new Date(date);
  }

  if (isNaN(then.getTime())) return "";

  const locale = currentLocale();
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const time = then.toLocaleTimeString(locTag(locale), { hour: "2-digit", minute: "2-digit" });

  if (diffMin < 1) return translate(locale, "common.justNow");
  if (diffMin < 60) return translate(locale, "common.minAgo", { n: diffMin });
  if (diffHour < 6) return translate(locale, "common.hourAgo", { n: diffHour });
  if (diffDay < 1) return translate(locale, "common.todayAt", { time });
  if (diffDay < 2) return translate(locale, "common.yesterdayAt", { time });
  if (diffDay < 7) return translate(locale, "common.dayAgo", { n: diffDay });

  return then.toLocaleDateString(locTag(locale), {
    day: "numeric",
    month: "short",
    year: now.getFullYear() !== then.getFullYear() ? "numeric" : undefined,
  });
}

function parseServerDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  if (!date.endsWith("Z") && !date.includes("+")) {
    return new Date(date + "Z");
  }
  return new Date(date);
}

export function formatChatTime(iso: string): string {
  const d = parseServerDate(iso);
  if (isNaN(d.getTime())) return "";

  const locale = currentLocale();
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const time = d.toLocaleTimeString(locTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return time;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) {
    return translate(locale, "common.yesterdayComma", { time });
  }

  return d.toLocaleDateString(locTag(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
