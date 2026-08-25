"use client";

/**
 * Провайдер СВЕТЛОЙ / ТЁМНОЙ темы (color scheme).
 *
 * ⚠️ Не путать с `components/ThemeProvider.tsx` — тот отвечает за кастомные
 * анимированные фоны (Themes: aurora, gradient, liquid, neon) и экспортирует
 * свой `useTheme`. Оба провайдера работают независимо друг от друга:
 * анимированный фон можно комбинировать с любой цветовой темой.
 *
 * Использует next-themes:
 *  - attribute="class" → вешает класс "dark" на <html>;
 *  - сам вставляет блокирующий <script>, устраняющий мерцание (FOUC) при SSR;
 *  - enableSystem → доступен режим «Системная».
 */
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof NextThemesProvider>;

export function ThemeModeProvider({ children, ...props }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
