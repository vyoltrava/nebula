"use client";

/**
 * ПЕРЕКЛЮЧАТЕЛЬ ТРЁХ ТЕМ — «Стандартная / Zune Windows Phone / Old iOS».
 * Выглядит как ряд «физических» кнопок в скевоморфном стиле (стеклянные
 * глянцевые кнопки с цветовыми индикаторами).
 */

import { useIosTheme, type ThemeChoice } from "../hooks/useIosTheme";

interface Option {
  id: ThemeChoice;
  label: string;
  hint: string;
  dot: string;
}

const OPTIONS: Option[] = [
  { id: "standard", label: "Стандартная", hint: "Классический интерфейс", dot: "ios-dot--standard" },
  { id: "zune", label: "Zune Windows Phone", hint: "Metro / магента", dot: "ios-dot--zune" },
  { id: "ios", label: "Old iOS", hint: "Скевоморфизм", dot: "ios-dot--ios" },
];

export function IosThemeSelector() {
  const { choice, setChoice } = useIosTheme();

  return (
    <div className="ios-theme-selector" role="radiogroup" aria-label="Тема оформления">
      {OPTIONS.map((opt) => {
        const active = choice === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            className={`ios-theme-option${active ? " is-active" : ""}`}
            onClick={() => setChoice(opt.id)}
          >
            <span className={`ios-theme-dot ${opt.dot}`} aria-hidden />
            <span className="ios-theme-option-body">
              <span className="ios-theme-option-label">{opt.label}</span>
              <span className="ios-theme-option-hint">{opt.hint}</span>
            </span>
            <span className="ios-theme-check" aria-hidden>
              {active ? "✓" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}