"use client";

/**
 * нопка в стиле Windows Phone / Zune (flat, без теней).
 * ри наведении — подчёркивание (как в WP). кцентные — #FF00FF.
 */
import type { ButtonHTMLAttributes, FC } from "react";

export interface ZuneButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export const ZuneButton: FC<ZuneButtonProps> = ({
  children,
  variant = "primary",
  className = "",
  ...rest
}) => {
  const variantCls =
    variant === "primary"
      ? "zune-btn--primary"
      : variant === "secondary"
      ? "zune-btn--secondary"
      : "zune-btn--ghost";

  return (
    <button
      type="button"
      className={`zune-btn ${variantCls} ${className}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
};
