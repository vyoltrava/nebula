import { uk, type Dictionary } from "./uk";  // 👈 uk первым
import { ru } from "./ru";
import { en } from "./en";

export type Locale = "uk" | "ru" | "en";  // 👈 uk первым
export type { Dictionary };

export const LOCALES: Locale[] = ["uk", "ru", "en"];  // 👈 uk первым
export const DEFAULT_LOCALE: Locale = "uk";  // 👈 uk по умолчанию
export const LOCALE_STORAGE_KEY = "nebula-locale";

export const dictionaries: Record<Locale, Dictionary> = { uk, ru, en };  // 👈 uk первым

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "uk" || value === "ru" || value === "en";  // 👈 uk первым
}
type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}.${NestedKeyOf<T[K]>}` : K;
    }[keyof T & string]
  : never;

export type MessageKey = NestedKeyOf<Dictionary>;

function lookup(dict: Dictionary, key: string): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : key;
}

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  return interpolate(lookup(dictionaries[locale], key), params);
}
