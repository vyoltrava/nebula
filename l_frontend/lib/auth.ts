import { socket } from "@/lib/websocket";
import { clearCachedUser } from "./authCache";
import { clearAllSessionKeys } from "@/lib/secureSessionKeys";

const ACCOUNTS_KEY = "trelod_accounts_v1";
const ACTIVE_KEY = "trelod_active_v1";
const MAX_ACCOUNTS = 3;

export interface StoredAccount {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  token: string;
  addedAt: number;
}

const isBrowser = () => typeof window !== "undefined";

function getAccountsList(): StoredAccount[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccountsList(list: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  if (isBrowser()) window.dispatchEvent(new Event("accounts-changed"));
}

// 🎯 1. Получить список всех аккаунтов
export function getAccounts(): StoredAccount[] {
  return getAccountsList();
}

// 🎯 2. Получить ID активного аккаунта
export function getActiveAccountId(): number | null {
  if (!isBrowser()) return null;
  const id = Number(localStorage.getItem(ACTIVE_KEY));
  if (!id) return null;
  return getAccountsList().some((a) => a.userId === id) ? id : null;
}

// 🎯 3. Получить данные активного аккаунта
export function getActiveAccount(): StoredAccount | null {
  const id = getActiveAccountId();
  if (id == null) return null;
  return getAccountsList().find((a) => a.userId === id) || null;
}

// 🎯 4. ГЛАВНОЕ: getToken теперь берет токен именно активного аккаунта!
export function getToken(): string | null {
  return getActiveAccount()?.token || null;
}

// 🎯 5. setToken теперь сохраняет аккаунт в общий список!
export function setToken(
  token: string, 
  user?: { id: number; username: string; display_name: string; avatar_url?: string | null }
) {
  if (!user) {
    // Fallback для старых вызовов, если user не передан
    localStorage.setItem("token", token);
    socket.connect(token);
    return;
  }

  const list = getAccountsList().filter((a) => a.userId !== user.id);
  list.push({
    userId: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url || null,
    token,
    addedAt: Date.now(),
  });

  // Лимит аккаунтов: удаляем самый старый
  while (list.length > MAX_ACCOUNTS) {
    const oldest = [...list].sort((a, b) => a.addedAt - b.addedAt)[0];
    list.splice(list.indexOf(oldest), 1);
  }

  saveAccountsList(list);
  localStorage.setItem(ACTIVE_KEY, String(user.id));
  
  socket.connect(token);
}

// 🎯 6. Очистка текущего аккаунта
export function clearToken() {
  const activeId = getActiveAccountId();
  if (activeId) {
    removeAccount(activeId);
  } else {
    localStorage.removeItem("token");
  }
  clearCachedUser();
  socket.disconnect();
  clearAllSessionKeys();
}

// 🎯 7. Переключение аккаунта (перезагрузка для чистоты состояния)
export function switchAccount(userId: number): void {
  const list = getAccountsList();
  if (!list.some((a) => a.userId === userId)) return;
  
  localStorage.setItem(ACTIVE_KEY, String(userId));
  window.location.href = "/"; // Надежная перезагрузка с новым токеном
}

// 🎯 8. Удаление аккаунта из списка
export function removeAccount(userId: number): void {
  const list = getAccountsList().filter((a) => a.userId !== userId);
  saveAccountsList(list);
  
  if (getActiveAccountId() === userId) {
    if (list.length > 0) {
      localStorage.setItem(ACTIVE_KEY, String(list[0].userId));
    } else {
      localStorage.removeItem(ACTIVE_KEY);
      clearCachedUser();
      socket.disconnect();
      clearAllSessionKeys();
    }
  }
}