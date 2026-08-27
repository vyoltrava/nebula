"use client";

/**
 * ПЕРЕКЛЮЧАТЕЛЬ ТРЁХ ТЕМ — «Стандартная / Zune Windows Phone / Old iOS».
 * Это ЕДИНАЯ точка переключения оболочек: читает оба store (iOS и Zune),
 * вычисляет текущее состояние и на клик вызывает applyThemeChoice, который
 * согласованно пишет оба store (взаимоисключение без слежения за <body>).
 */

import { useSyncExternalStore } from "react";
import {
  useIosTheme,
  subscribeIosPreference,
  getIosSnapshot,
  getIosServerSnapshot,
  type ThemeChoice,
} from "../hooks/useIosTheme";
import {
  subscribePreference,
  getPreferenceSnapshot,
  getPreferenceServerSnapshot,
} from "@/themes/zune/hooks/useZuneTheme";

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
  const { apply } = useIosTheme();

  const iosPref = useSyncExternalStore(
    subscribeIosPreference,
    getIosSnapshot,
    getIosServerSnapshot
  );
  const zunePref = useSyncExternalStore(
    subscribePreference,
    getPreferenceSnapshot,
    getPreferenceServerSnapshot
  );

  const current: ThemeChoice =
    zunePref === "zune" ? "zune" : iosPref === "ios" ? "ios" : "standard";

  return (
    <div className="ios-theme-selector" role="radiogroup" aria-label="Тема оформления">
      {OPTIONS.map((opt) => {
        const active = current === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            className={`ios-theme-option${active ? " is-active" : ""}`}
            onClick={() => apply(opt.id)}
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