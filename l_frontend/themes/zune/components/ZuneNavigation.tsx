"use client";

/**
 * Кнопки-выступы Zune: «Назад / Воспроизвести / Далее»,
 * уходят за края экрана (--zune-button-bleed), остаются кликабельными.
 * Стили — themes/zune/styles/zune-navigation.css.
 */

interface ZuneNavigationProps {
  onBack?: () => void;
  onPlay?: () => void;
  onNext?: () => void;
  playing?: boolean;
  disabled?: boolean;
  backLabel?: string;
  playLabel?: string;
  pauseLabel?: string;
  nextLabel?: string;
}

export function ZuneNavigation({
  onBack,
  onPlay,
  onNext,
  playing = false,
  disabled = false,
  backLabel = "Назад",
  playLabel = "Воспроизвести",
  pauseLabel = "Пауза",
  nextLabel = "Далее",
}: ZuneNavigationProps) {
  return (
    <nav className="zt-nav" aria-label="Управление плеером">
      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--bleed-left"
        onClick={onBack}
        disabled={disabled}
      >
        <span className="zt-nav-glyph" aria-hidden="true">◄</span> {backLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--center"
        onClick={onPlay}
        aria-pressed={playing}
        disabled={disabled}
      >
        <span className="zt-nav-glyph" aria-hidden="true">{playing ? "❚❚" : "▶"}</span>{" "}
        {playing ? pauseLabel : playLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--bleed-right"
        onClick={onNext}
        disabled={disabled}
      >
        {nextLabel} <span className="zt-nav-glyph" aria-hidden="true">►</span>
      </button>
    </nav>
  );
}
