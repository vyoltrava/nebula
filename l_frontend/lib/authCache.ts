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
    // 🔄 Stale-while-revalidate: возвращаем юзера ДАЖЕ если кэш устарел.
    // TTL проверяется отдельно через isCachedUserFresh() — устаревший юзер
    // всё равно лучше «мерцания неавторизованного» в сайдбаре, пока идёт
    // фоновый запрос /api/me (типичный кейс: вкладка была неактивна > 5 мин).
    return parsed.user;
  } catch {
    return null;
  }
}

/** Свежий ли кэш (в пределах TTL). Для решения «достаточно ли кэша, не ходя в сеть». */
export function isCachedUserFresh(): boolean {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return (
      parsed.userId === getActiveAccountId() &&
      Date.now() - parsed.timestamp <= CACHE_TTL
    );
  } catch {
    return false;
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