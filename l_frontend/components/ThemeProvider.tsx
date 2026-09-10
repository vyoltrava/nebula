"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { BUILTIN_THEMES, ThemeConfig } from "@/lib/themes";
import { getToken } from "@/lib/auth";

interface ThemeContextValue {
  theme: ThemeConfig | null;
  themes: ThemeConfig[];
  setTheme: (t: ThemeConfig | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: null,
  themes: BUILTIN_THEMES,
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeConfig | null>(null);
  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);

  // 🎨 Восстановление выбранной темы из localStorage.
  // Без этого тема сбрасывалась при каждой перезагрузке страницы и после
  // каждого деплоя (состояние начиналось с null).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("active_theme");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) setThemeState(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // Загрузка тем с бэкенда. Темы теперь ВСЕГДА включены — отдельный тумблер
  // (themes_enabled) больше не опрашиваем для обычных юзеров (он требует
  // auth и на 401 прятал все темы). Достаточно списка /api/themes.
  useEffect(() => {
    async function loadRemoteThemes() {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // 🎨 Список тем. При ошибке — не трогаем текущее состояние.
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes`, { headers });
        if (res.ok) {
          const data = await res.json();
          // Темами считаем и встроенные (BUILTIN), и серверные.
          // Если бэк с пустым списком отдал [] — всё равно показываем builtin.
          const source = (Array.isArray(data) && data.length > 0) ? [...BUILTIN_THEMES, ...data] : BUILTIN_THEMES;
          // Дедуп по id (бэк может вернуть и builtin)
          const seen = new Set<string>();
          const merged: ThemeConfig[] = [];
          for (const t of source) {
            const key = String((t as ThemeConfig).id);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(t as ThemeConfig);
          }
          setThemes(merged);
          setThemeState((cur) => {
            // Тема ещё валидна — оставляем
            if (cur && merged.find((t: ThemeConfig) => String(t.id) === String(cur.id))) {
              return cur;
            }
            // Тема пропала (админ удалил) → из сохранённой, иначе дефолтная
            try {
              const savedRaw = localStorage.getItem("active_theme");
              if (savedRaw) {
                const saved = JSON.parse(savedRaw);
                const match = merged.find((t: ThemeConfig) => String(t.id) === String(saved?.id));
                if (match) return match;
              }
            } catch { /* ignore */ }
            // Иначе — тема по умолчанию (если есть)
            return merged.find((t: ThemeConfig) => t.is_default) || null;
          });
        }
      } catch {
        /* сеть недоступна — оставляем текущее состояние */
      }
    }
    loadRemoteThemes();

    // Периодически обновляем (раз в минуту — на случай если админ добавил тему)
    const interval = setInterval(loadRemoteThemes, 60000);
    return () => clearInterval(interval);
  }, []);

  function setTheme(t: ThemeConfig | null) {
    setThemeState(t);
    try {
      if (t) localStorage.setItem("active_theme", JSON.stringify(t));
      else localStorage.removeItem("active_theme");
    } catch {}
  }

  // 🎨 Глобальный CSS-хук: html[data-theme-active="1"].
  // По нему globals.css делает поверхности (main-контейнеры страниц)
  // полупрозрачными, чтобы анимированная тема просвечивала на ВСЕХ
  // страницах, а не только в админке.
  useEffect(() => {
    try {
      if (theme) document.documentElement.setAttribute("data-theme-active", "1");
      else document.documentElement.removeAttribute("data-theme-active");
    } catch { /* ignore */ }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, themes, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}