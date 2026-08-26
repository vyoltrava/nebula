"use client";

/**
 * Переключатель «Стандартная ↔ Zune Windows Phone».
 * Нативный switch в стиле Windows Phone: круглый ползунок.
 *
 * Режимы:
 *   <ZuneThemeToggle />                          — строка с подписями;
 *   <ZuneThemeToggle floating />                 — плавающая кнопка возврата;
 *   <ZuneThemeToggle floating variant="invite"/> — приглашение включить тему.
 */

import { useZuneTheme } from "../hooks/useZuneTheme";

interface ZuneThemeToggleProps {
  /** Плавающий режим (кнопка поверх UI) */
  floating?: boolean;
  /** exit — выключить тему, invite — пригласить включить */
  variant?: "exit" | "invite";
}

export function ZuneThemeToggle({
  floating = false,
  variant = "exit",
}: ZuneThemeToggleProps) {
  const { isZuneTheme, toggleTheme } = useZuneTheme();

  if (floating) {
    const invite = variant === "invite" && !isZuneTheme;

    return (
      <button
        type="button"
        className={`zune-floating-toggle${
          invite ? " zune-floating-toggle--invite" : ""
        }`}
        onClick={toggleTheme}
        title={invite ? "Включить тему Zune" : "Вернуться к стандартной теме"}
        aria-label={
          invite ? "Включить тему Zune Windows Phone" : "Выключить тему Zune"
        }
      >
        {invite ? (
          <>
            <span className="zune-floating-dot" aria-hidden />
            Включить тему Zune
          </>
        ) : (
          <>
            <span aria-hidden>◄</span> Стандартная тема
          </>
        )}
      </button>
    );
  }

  return (
    <div className="zune-theme-toggle">
      <label className="zune-toggle-row">
        <span className="zune-toggle-label">Стандартная</span>
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
