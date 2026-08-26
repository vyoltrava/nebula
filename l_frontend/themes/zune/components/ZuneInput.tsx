"use client";

/**
 * Инпут в стиле Windows Phone: без фона, только нижняя линия,
 * при фокусе линия становится маджентой. Для type="search"
 * автоматически добавляется иконка лупы (Segoe MDL2 \uE71E) слева.
 */

import type { InputHTMLAttributes } from "react";
import { useId } from "react";

interface ZuneInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function ZuneInput({
  label,
  className,
  type = "text",
  ...rest
}: ZuneInputProps) {
  const id = useId();
  const withIcon = type === "search";

  return (
    <div className="space-y-1">
      {label ? (
        <label htmlFor={id} className="zune-post-date block">
          {label}
        </label>
      ) : null}
      <div className={`zune-input-wrap${withIcon ? " has-icon" : ""}`}>
        {withIcon ? (
          <span className="zune-input-icon" aria-hidden="true">
            {"\uE71E"}
          </span>
        ) : null}
        <input
          id={id}
          type={type}
          className={`zune-input ${className ?? ""}`}
          {...rest}
        />
      </div>
    </div>
  );
}
