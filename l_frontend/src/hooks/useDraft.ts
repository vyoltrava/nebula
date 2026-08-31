"use client";
import { useState, useEffect, useCallback } from "react";

/**
 * Мгновенное сохранение текста в localStorage.
 * Текст сохраняется прямо при вводе, переживает перезагрузку страницы.
 */
export function useDraft(key: string, initialValue: string = "") {
  const [value, setValue] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(key);
      return saved !== null ? saved : initialValue;
    }
    return initialValue;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
      // уведомить другие компоненты (список чатов) об изменении черновика
      window.dispatchEvent(new Event("drafts-changed"));
    }
  }, [key, value]);

  const clear = useCallback(() => {
    setValue("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(key);
    }
  }, [key]);

  return [value, setValue, clear] as const;
}