// Кеш статуса подписок (в памяти + localStorage)
// 🆕 namespace по активному аккаунту: статус "подписан/нет" зависит от зрителя,
// поэтому между аккаунтами кэш не должен перетекать (заебка со старыми данными).
import { getActiveAccountId } from "./auth";

const cache = new Map<string, boolean>();

export function getCachedFollow(userId: number): boolean | null {
  const acc = getActiveAccountId();
  if (acc == null) return null;
  const key = `${acc}:${userId}`;
  if (cache.has(key)) return cache.get(key)!;
  const stored = localStorage.getItem(`follow_${acc}_${userId}`);
  if (stored !== null) {
    const val = stored === "true";
    cache.set(key, val);
    return val;
  }
  return null;
}

export function setCachedFollow(userId: number, value: boolean) {
  const acc = getActiveAccountId();
  if (acc == null) return;
  const key = `${acc}:${userId}`;
  cache.set(key, value);
  localStorage.setItem(`follow_${acc}_${userId}`, String(value));
}

export function clearFollowCache() {
  cache.clear();
}