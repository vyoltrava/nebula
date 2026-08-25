"use client";

/**
 * 🌗 Переключатель светлой/тёмной темы.
 *
 * Использует next-themes (класс "dark" на <html> вешает ThemeModeProvider).
 * ⚠️ Не путать с useTheme из "@/components/ThemeProvider" — тот про
 * анимированные фоны (aurora/gradient/liquid/neon).
 *
 * Гидратация: до монтирования рендерим стабильный placeholder тех же
 * размеров, поэтому SSR-разметка совпадает с клиентской и React не кидает
 * hydration mismatch (тему знает только браузер).
 */
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

type Props = {
  className?: string;
  /** Размер иконки (px), по умолчанию 18 */
  size?: number;
};

export function ThemeToggle({ className = "", size = 18 }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex h-10 w-10 shrink-0 rounded-xl ${className}`}
      />
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`group relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-ivory text-gray-600 transition-colors duration-300 hover:bg-gray-100 active:scale-95 dark:border-white/15 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 ${className}`}
    >
      {/* Солнце видно в тёмной теме (клик → светлая) */}
      <Sun
        size={size}
        className={`absolute transition-all duration-300 ${
          isDark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
        }`}
      />
      {/* Луна видна в светлой теме (клик → тёмная) */}
      <Moon
        size={size}
        className={`absolute transition-all duration-300 ${
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0"
        }`}
      />
    </button>
  );
}
