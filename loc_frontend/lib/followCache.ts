// Кеш статуса подписок (в памяти + localStorage)
const cache = new Map<number, boolean>();

export function getCachedFollow(userId: number): boolean | null {
  if (cache.has(userId)) return cache.get(userId)!;
  const stored = localStorage.getItem(`follow_${userId}`);
  if (stored !== null) {
    const val = stored === "true";
    cache.set(userId, val);
    return val;
  }
  return null;
}

export function setCachedFollow(userId: number, value: boolean) {
  cache.set(userId, value);
  localStorage.setItem(`follow_${userId}`, String(value));
}

export function clearFollowCache() {
  cache.clear();
}