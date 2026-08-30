// lib/pwa/cache.ts
// Утилиты для работы с Cache API: очистка, просмотр, удаление по ключу.
// Все функции безопасны для старых браузеров (feature detection внутри).

const canUseCache = (): boolean =>
  typeof caches !== "undefined" && typeof caches.keys === "function";

/** Дропает ВСЕ кэши приложения (для кнопки "сбросить кэш" / диагностики). */
export async function clearAllCaches(): Promise<boolean> {
  if (!canUseCache()) return false;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    return true;
  } catch (e) {
    console.error("[PWA] Ошибка очистки кэшей:", e);
    return false;
  }
}

/** Удаляет кэш по имени (например, старую версию). */
export async function deleteCache(name: string): Promise<boolean> {
  if (!canUseCache()) return false;
  try {
    return await caches.delete(name);
  } catch (e) {
    console.error("[PWA] Ошибка удаления кэша:", e);
    return false;
  }
}

/** Список имён кэшей приложения. */
export async function listCaches(): Promise<string[]> {
  if (!canUseCache()) return [];
  try {
    return await caches.keys();
  } catch {
    return [];
  }
}

/** Проверяет, есть ли запрос в каком-либо кэше. */
export async function isRequestCached(url: string): Promise<boolean> {
  if (!canUseCache()) return false;
  try {
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      const hit = await cache.match(url);
      if (hit) return true;
    }
    return false;
  } catch {
    return false;
  }
}