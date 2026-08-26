"use client";

/**
 * нпут в стиле Windows Phone — прозрачный, только нижняя линия.
 * ри фокусе линия становится #FF00FF.
 */
import type { InputHTMLAttributes, FC } from "react";

export interface ZuneInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const ZuneInput: FC<ZuneInputProps> = ({
  label,
  icon,
  className = "",
  ...rest
}) => {
  const inputCls = `zune-input ${className}`.trim();
  return (
        <div className="zune-input-wrap">
      {icon && <span className="zune-input-icon">{icon}</span>}
      <input className={inputCls} {...rest} />
      {label && <label className="zune-input-label">{label}</label>}
    </div>
  );
};
