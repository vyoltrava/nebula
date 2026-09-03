// Кеш статуса подписок (в памяти + localStorage)
// 🆕 namespace по активному аккаунту: статус "подписан/нет" зависит от зрителя,
// поэтому между аккаунтами кэш не должен перетекать (заебка со старыми данными).
// 🆕 TTL: кеш устаревает через 5 минут — после этого статус всегда сверяется
// с сервером (иначе кнопка «читаю» навечно показывает устаревший статус,
// например после отписки с другого устройства).
import { getActiveAccountId } from "./auth";

const FOLLOW_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { value: boolean; at: number }>();

function keyFor(userId: number): string | null {
  const acc = getActiveAccountId();
  if (acc == null) return null;
  return `${acc}:${userId}`;
}

export function getCachedFollow(userId: number): boolean | null {
  const key = keyFor(userId);
  if (!key) return null;
  const entry = cache.get(key);
  if (entry) {
    if (Date.now() - entry.at < FOLLOW_TTL_MS) return entry.value;
    cache.delete(key);
    return null; // устарел — нужно свериться с сервером
  }
  const stored = localStorage.getItem(`follow_${key}`);
  if (stored !== null) {
    const ts = Number(localStorage.getItem(`follow_ts_${key}`) || 0);
    const val = stored === "true";
    if (ts && Date.now() - ts < FOLLOW_TTL_MS) {
      cache.set(key, { value: val, at: ts });
      return val;
    }
    // устаревшая запись — выкидываем
    localStorage.removeItem(`follow_${key}`);
    localStorage.removeItem(`follow_ts_${key}`);
  }
  return null;
}

export function setCachedFollow(userId: number, value: boolean) {
  const key = keyFor(userId);
  if (!key) return;
  const now = Date.now();
  cache.set(key, { value, at: now });
  localStorage.setItem(`follow_${key}`, String(value));
  localStorage.setItem(`follow_ts_${key}`, String(now));
}

export function clearFollowCache() {
  cache.clear();
}