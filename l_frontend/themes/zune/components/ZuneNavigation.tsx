"use client";

/**
 * Кнопки-выступы Zune HD: «Назад / Воспроизвести / Далее».
 * Боковые уходят за края экрана и остаются кликабельными.
 */

interface ZuneNavigationProps {
  onBack?: () => void;
  onPlay?: () => void;
  onNext?: () => void;
  playing?: boolean;
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
      >
        <span className="zt-nav-glyph" aria-hidden>◄</span> {backLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--center"
        onClick={onPlay}
        aria-pressed={playing}
      >
        <span className="zt-nav-glyph" aria-hidden>{playing ? "❚❚" : "▶"}</span>{" "}
        {playing ? pauseLabel : playLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--bleed-right"
        onClick={onNext}
      >
        {nextLabel} <span className="zt-nav-glyph" aria-hidden>►</span>
      </button>
    </nav>
  );
}
