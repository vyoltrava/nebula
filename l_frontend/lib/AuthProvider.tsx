"use client";

/**
 * 🔐 AuthProvider — единый источник статуса авторизации.
 *
 * Убирает «мерцание» UI: статус читается СИНХРОННО при первом рендере
 * (localStorage активного аккаунта + cookie-подсказка nebula_auth_hint),
 * а не после асинхронного запроса. Асинхронно статус лишь подтверждается
 * через GET /api/auth/validate (мягко: сетевой сбой не разлогинивает).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getToken, getActiveAccount, refreshAccessToken, getAccounts } from "@/lib/auth";
import { API_URL } from "@/lib/apiUrl";
import { getAuthHint, clearAuthHint } from "@/lib/cookieManager";

interface AuthContextValue {
  /** Синхронно известный статус сессии (без ожидания сети). */
  isAuthenticated: boolean;
  /** false сразу после гидрации — компоненты могут рендерить без мерцания. */
  isInitialized: boolean;
  /** Обновить статус (например, после логина/логаута). */
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  isInitialized: false,
  refreshAuth: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/** Синхронная проверка: есть ли живая сессия на этом устройстве. */
function checkSessionSync(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const token = getToken();
    if (token) return true;
    // Легаси-фоллбэк: подсказка в куке без аккаунта в списке
    return getAuthHint() != null && getAccounts().length > 0;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // useState-инициализатор → статус известен в ПЕРВЫЙ рендер, мерцания нет.
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => checkSessionSync());
  const [isInitialized, setIsInitialized] = useState(true);

  const refreshAuth = useCallback(() => {
    setIsAuthenticated(checkSessionSync());
  }, []);

  // Асинхронная валидация: подтверждаем токен на сервере. Мягкая политика:
  // сеть недоступна / сервер перезапускается — НЕ разлогиниваем (401 не было).
  useEffect(() => {
    let cancelled = false;
    const validate = async () => {
      const token = getToken();
      if (!token) {
        clearAuthHint();
        if (!cancelled) setIsAuthenticated(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/auth/validate`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (cancelled) return;
        if (res.status === 401) {
          // Токен истёк — пробуем тихо обновить через refresh-cookie.
          const { token: fresh, unreachable } = await refreshAccessToken();
          if (cancelled) return;
          if (fresh) {
            setIsAuthenticated(true);
          } else if (!unreachable) {
            // Сессия реально мертва — чистим подсказку (токен чистит apiFetch/auth).
            clearAuthHint();
            setIsAuthenticated(false);
            window.dispatchEvent(new Event("auth:logout"));
          }
        } else if (res.ok) {
          setIsAuthenticated(true);
        }
        // прочие статусы (5xx) — игнорируем, остаёмся в текущем состоянии
      } catch {
        /* сеть недоступна — не разлогиниваем */
      }
    };
    validate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Поддержание статуса в актуальном состоянии: логаут, смена/добавление аккаунтов.
  useEffect(() => {
    const onLogout = () => setIsAuthenticated(false);
    const onAccounts = () => setIsAuthenticated(checkSessionSync());
    window.addEventListener("auth:logout", onLogout);
    window.addEventListener("accounts-changed", onAccounts);
    window.addEventListener("focus", onAccounts);
    return () => {
      window.removeEventListener("auth:logout", onLogout);
      window.removeEventListener("accounts-changed", onAccounts);
      window.removeEventListener("focus", onAccounts);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isInitialized, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}