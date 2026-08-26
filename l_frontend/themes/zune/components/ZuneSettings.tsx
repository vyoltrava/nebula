"use client";

/**
 * Настройки — Zune-версия (стандартный Settings не тронут).
 * Ключевой раздел — «Оформление»: переключатель
 * «Стандартная ↔ Zune Windows Phone» на нативном switch,
 * выбор сохраняется в localStorage ("zune-theme-preference").
 *
 * Подключение без изменения стандартных файлов:
 *   - через условный рендеринг в корневом layout при isZuneTheme;
 *   - либо <ZuneThemeToggle /> в любой точке приложения.
 */

import { useState } from "react";
import { useZuneTheme } from "../hooks/useZuneTheme";
import { ZuneButton } from "./ZuneButton";
import { ZuneInput } from "./ZuneInput";
import { ZuneThemeToggle } from "./ZuneThemeToggle";

interface ZuneRow {
  label: string;
  hint?: string;
}

const DECOR_ROWS: ZuneRow[] = [
  { label: "Уведомления", hint: "push и звук" },
  { label: "Живые плитки", hint: "анимация плиток" },
  { label: "Автовоспроизведение", hint: "видео в ленте" },
];

export function ZuneSettings() {
  const { preference } = useZuneTheme();
  const [rows, setRows] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DECOR_ROWS.map((r) => [r.label, true]))
  );

  return (
    <section aria-label="Настройки Zune">
      <h2 className="zune-modal-title">НАСТРОЙКИ</h2>

      {/* ─── ОФОРМЛЕНИЕ: переключатель темы ─── */}
      <div className="zune-post" style={{ marginBottom: 16 }}>
        <div className="zune-user-name" style={{ marginBottom: 12 }}>
          Оформление
        </div>
        <ZuneThemeToggle />
        <p className="zune-post-date" style={{ marginTop: 10 }}>
          Выбор сохраняется автоматически ({preference === "zune" ? "zune" : "standard"}).
        </p>
      </div>

      {/* Декоративные строки настроек в стиле WP */}
      {DECOR_ROWS.map((row) => (
        <label key={row.label} className="zune-toggle-row zune-post">
          <span>
            <span className="zune-user-name">{row.label}</span>
            {row.hint ? (
              <>
                <br />
                <span className="zune-post-date">{row.hint}</span>
              </>
            ) : null}
          </span>
          <input
            type="checkbox"
            role="switch"
            className="zune-switch"
            checked={rows[row.label]}
            onChange={() =>
              setRows((prev) => ({ ...prev, [row.label]: !prev[row.label] }))
            }
            aria-label={row.label}
          />
        </label>
      ))}

      {/* Поиск по настройкам — инпут WP-стиля */}
      <div style={{ marginTop: 20 }}>
        <ZuneInput type="search" placeholder="Поиск по настройкам" />
      </div>

      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <ZuneButton variant="primary">Сохранить</ZuneButton>
        <ZuneButton variant="secondary">Сбросить</ZuneButton>
      </div>
    </section>
  );
}
