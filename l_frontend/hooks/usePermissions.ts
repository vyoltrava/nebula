"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export interface MeInfo {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  is_moderator: boolean;
  permissions?: string[];
  credits?: number;
  [key: string]: unknown;
}

/**
 * usePermissions — хук доступа к текущему пользователю и проверке прав.
 * is_admin => имеет все права.
 */
export function usePermissions() {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/me", { skipAuthRefresh: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive) {
          setMe(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (alive) setIsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hasPermission = (perm: string): boolean => {
    if (!me) return false;
    if (me.is_admin) return true;
    return Array.isArray(me.permissions) && me.permissions.includes(perm);
  };

  return { me, hasPermission, isLoading };
}
