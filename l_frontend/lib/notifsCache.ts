// lib/notifsCache.ts — общий кратковременный кэш уведомлений.
// Уведомления дёргаются и из страницы /notifications, и из модалки в Sidebar.
// Короткий TTL (15с) даёт мгновенное открытие при частых переходах, но не
// даёт списку сильно устаревать.

let _cache: { data: any[]; at: number } | null = null;
const TTL = 15_000;

export function getNotifsCache(): any[] | null {
  if (!_cache) return null;
  if (Date.now() - _cache.at > TTL) {
    _cache = null;
    return null;
  }
  return _cache.data;
}

export function setNotifsCache(data: any[]): void {
  _cache = { data, at: Date.now() };
}

export function invalidateNotifsCache(): void {
  _cache = null;
}