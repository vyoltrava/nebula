import { getActiveAccountId } from "./auth";

const cache = new Map<number, any[]>();
let cacheRevision = 0;

export function getNotifsCache(): any[] | null {
  const accountId = getActiveAccountId();
  return accountId == null ? null : cache.get(accountId) ?? null;
}

export function setNotifsCache(data: any[]): void {
  const accountId = getActiveAccountId();
  if (accountId != null) cache.set(accountId, data);
}

export function createNotifsCacheWriter(): (data: any[]) => void {
  const accountId = getActiveAccountId();
  const revision = cacheRevision;
  return (data) => {
    if (accountId == null || accountId !== getActiveAccountId() || revision !== cacheRevision) return;
    cache.set(accountId, data);
  };
}

export function updateNotifsCache(update: (data: any[]) => any[]): void {
  const data = getNotifsCache();
  if (data) setNotifsCache(update(data));
}

export function clearNotifsCache(): void {
  cache.clear();
  cacheRevision += 1;
}