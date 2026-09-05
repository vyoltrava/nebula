"use client";
// 🏷️ Глобальный провайдер префиксов пользователей.
// Один запрос /api/user-prefixes/assignments → map user_id → prefix.
// Используется в постах, чатах, списках и т.д. через useUserPrefix(userId).
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { UserPrefixBadge } from "./UserPrefixBadge";

const API = process.env.NEXT_PUBLIC_API_URL;

type Prefix = { icon: string; color: string; bg_color: string };

const PrefixesContext = createContext<Record<number, Prefix>>({});

export function UserPrefixProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<number, Prefix>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/api/user-prefixes/assignments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (cancelled) return;
        const m: Record<number, Prefix> = {};
        for (const item of list) {
          m[item.user_id] = { icon: item.icon, color: item.color, bg_color: item.bg_color };
        }
        setMap(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return <PrefixesContext.Provider value={map}>{children}</PrefixesContext.Provider>;
}

/** Возвращает префикс пользователя по id (или null). */
export function useUserPrefix(userId?: number | null): Prefix | null {
  const map = useContext(PrefixesContext);
  if (!userId) return null;
  return map[userId] || null;
}

/**
 * 🏷️ Компонент-обёртка: сам подтягивает префикс из контекста,
 * если он не пришёл в payload. Можно безопасно использовать в .map().
 */
export function UserPrefix({
  userId,
  prefix,
  size = 14,
  className = "",
}: {
  userId?: number | null;
  prefix?: Prefix | null;
  size?: number;
  className?: string;
}) {
  const ctx = useUserPrefix(userId);
  return <UserPrefixBadge prefix={prefix || ctx} size={size} className={className} />;
}

