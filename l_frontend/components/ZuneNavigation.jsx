"use client";

/**
 * ZUNE PHONE DESIGN SYSTEM — «Кнопки-бесконечность»
 *
 * Кастомная навигация Zune: боковые кнопки смещены за края экрана
 * (transform: translateX(var(--zune-button-bleed))) и остаются
 * кликабельными — transform не влияет на hit-area элемента.
 * Крупные цели: min-height 64px + большой горизонтальный паддинг
 * (см. .zt-nav-btn--bleed-* в components/zune/zune-theme.css).
 */

export default function ZuneNavigation({
  onBack,
  onPlay,
  onNext,
  playing = false,
  disabled = false,
  backLabel = "Назад",
  playLabel = "Воспроизвести",
  pauseLabel = "Пауза",
  nextLabel = "Далее",
}) {
  return (
    <nav className="zt-nav" aria-label="Управление плеером">
      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--bleed-left"
        onClick={onBack}
        disabled={disabled}
      >
        <span className="zt-nav-glyph" aria-hidden="true">
          ◄
        </span>{" "}
        {backLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--center"
        onClick={onPlay}
        aria-pressed={playing}
        disabled={disabled}
      >
        <span className="zt-nav-glyph" aria-hidden="true">
          {playing ? "❚❚" : "▶"}
        </span>{" "}
        {playing ? pauseLabel : playLabel}
      </button>

      <button
        type="button"
        className="zt-nav-btn zt-nav-btn--bleed-right"
        onClick={onNext}
        disabled={disabled}
      >
        {nextLabel}{" "}
        <span className="zt-nav-glyph" aria-hidden="true">
          ►
        </span>
      </button>
    </nav>
  );
}
