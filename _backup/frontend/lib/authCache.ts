const USER_CACHE_KEY = "nebula_user_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

export function getCachedUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Проверяем, что кэш не устарел
    if (Date.now() - parsed.timestamp > CACHE_TTL) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

export function setCachedUser(user: any) {
  try {
    localStorage.setItem(
      USER_CACHE_KEY,
      JSON.stringify({
        user,
        timestamp: Date.now(),
      })
    );
  } catch {}
}

export function clearCachedUser() {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}