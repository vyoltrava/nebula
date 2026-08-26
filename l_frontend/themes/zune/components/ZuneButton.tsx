"use client";

/**
 * Плоская кнопка Windows Phone / Zune.
 *  - primary:   фон #FF00FF, белый текст;
 *  - secondary: прозрачная с белой обводкой;
 *  - ghost:     только текст, подчёркивание при наведении.
 * Скруглений нет (border-radius: 0), нажатие — затемнение/масштаб.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface ZuneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  children?: ReactNode;
}

export function ZuneButton({
  variant = "primary",
  block = false,
  className,
  children,
  ...rest
}: ZuneButtonProps) {
  const classes = [
    "zune-btn",
    `zune-btn--${variant}`,
    block ? "zune-btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" {...rest} className={classes}>
      {children}
    </button>
  );
}
