"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { BUILTIN_THEMES, ThemeConfig } from "@/lib/themes";

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

// ❌ ЗАКОММЕНТИРОВАТЬ ЭТОТ БЛОК ЦЕЛИКОМ:
// useEffect(() => {
//   try {
//     const saved = localStorage.getItem("active_theme");
//     if (saved) {
//       const parsed = JSON.parse(saved);
//       if (parsed && parsed.id) setThemeState(parsed);
//     } else {
//       // По умолчанию — встроенная дефолтная тема
//       const def = BUILTIN_THEMES.find((t) => t.is_default) || null;
//       setThemeState(def);
//     }
//   } catch {}
// }, []);

  // Загрузка тем с бэкенда + глобального тумблера
  useEffect(() => {
    async function loadRemoteThemes() {
      try {
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        
        // 1. Проверяем глобальный тумблер
        const settingsRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/themes/settings`,
          { headers }
        );
        let enabled = false;
        if (settingsRes.ok) {
          const s = await settingsRes.json();
          enabled = s.themes_enabled === true;
        }
        
        if (!enabled) {
          setThemes(BUILTIN_THEMES);
          setThemeState(null);
          return;
        }
        
        // 2. Загружаем список доступных тем
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/themes`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            // Мержим с встроенными (на случай если на бэке пусто)
            const merged = [...BUILTIN_THEMES, ...data];
            setThemes(merged);
            setThemeState((cur) => {
              if (cur && !merged.find((t: ThemeConfig) => String(t.id) === String(cur.id))) {
                return merged.find((t: ThemeConfig) => t.is_default) || merged[0];
              }
              return cur;
            });
          }
        }
      } catch (e) {
        console.log("[Theme] load failed, using builtin:", e);
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

  return (
    <ThemeContext.Provider value={{ theme, themes, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}