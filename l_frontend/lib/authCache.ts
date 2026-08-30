import { getActiveAccountId } from "./auth";

const USER_CACHE_KEY = "nebula_user_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// 🆕 Кэш привязываем к активному аккаунту. Иначе при переключении аккаунта
// (switchAccount → перезагрузка) сайдбар/профиль показывали бы данные ПРЕДЫДУЩЕГО
// аккаунта из кэша, потому что getCachedUser() возвращал старую запись.

export function getCachedUser(): any | null {
  try {
    // ⛔ Активный аккаунт сменился — кэш недействителен для текущего токена
    if (getActiveAccountId() == null) return null;
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // ⛔ Кэш принадлежит другому аккаунту
    if (!parsed.userId || parsed.userId !== getActiveAccountId()) {
      return null;
    }
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
        userId: user?.id ?? getActiveAccountId(),
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