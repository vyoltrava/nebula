"use client";
import { useState, useEffect, useCallback } from "react";

const NEBULA_KEY = "nebula_mode_enabled";
export const NEBULA_EVENT = "nebula-mode-changed";

/** Читает состояние Nebula-режима из localStorage (безопасно для SSR). */
export function getNebulaMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NEBULA_KEY) === "true";
  } catch {
    return false;
  }
}

export function useNebulaMode() {
  const [isNebula, setIsNebula] = useState(false);

  useEffect(() => {
    setIsNebula(getNebulaMode());
    // Синхронизация между компонентами (вкладка настроек, гейт, sidebar и т.д.)
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsNebula(typeof detail === "boolean" ? detail : getNebulaMode());
    };
    window.addEventListener(NEBULA_EVENT, onChanged);
    return () => window.removeEventListener(NEBULA_EVENT, onChanged);
  }, []);

  const toggleNebula = useCallback(() => {
    setIsNebula((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NEBULA_KEY, String(next));
      } catch {
        /* приватный режим */
      }
      window.dispatchEvent(new CustomEvent(NEBULA_EVENT, { detail: next }));
      return next;
    });
  }, []);

  return { isNebula, toggleNebula };
}