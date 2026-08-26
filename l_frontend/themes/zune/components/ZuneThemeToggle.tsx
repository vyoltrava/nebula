"use client";

/**
 * Переключатель темы «Стандартная ↔ Zune Windows Phone».
 * Нативный switch в стиле Windows Phone: круглый ползунок.
 *
 * Режимы использования:
 *   <ZuneThemeToggle />                 — компактный блок с подписями;
 *   <ZuneThemeToggle floating />        — плавающая кнопка поверх UI
 *                                         (рендерится провайдером, чтобы
 *                                         выключить тему без захода в настройки).
 */

import { useZuneTheme } from "../hooks/useZuneTheme";

interface ZuneThemeToggleProps {
  /** Плавающий режим (кнопка возврата к стандартной теме) */
  floating?: boolean;
}

export function ZuneThemeToggle({ floating = false }: ZuneThemeToggleProps) {
  const { isZuneTheme, toggleTheme } = useZuneTheme();

  if (floating) {
    return (
      <button
        type="button"
        className="zune-floating-toggle"
        onClick={toggleTheme}
        title="Вернуться к стандартной теме"
        aria-label="Выключить тему Zune"
      >
        <span aria-hidden>◄</span> Стандартная тема
      </button>
    );
  }

  return (
    <div className="zune-theme-toggle">
      <label className="zune-toggle-row">
        <span className="zune-toggle-label">Стандартная</span>
        {/* Нативный switch, как в WP: чекбокс + круглый ползунок */}
        <input
          type="checkbox"
          role="switch"
          checked={isZuneTheme}
          onChange={toggleTheme}
          className="zune-switch"
          aria-label="Тема Zune Windows Phone"
        />
        <span className="zune-toggle-label">Zune Windows Phone</span>
      </label>
    </div>
  );
}
