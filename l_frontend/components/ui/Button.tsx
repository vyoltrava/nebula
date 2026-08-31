"use client";

import Link from "next/link";
import { Loader2, type LucideIcon } from "lucide-react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "danger" | "success" | "ghost";
type Size = "sm" | "md" | "lg" | "icon" | "iconSm";

const variantClasses: Record<Variant, string> = {
  primary: "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]",
  secondary:
    "border border-line dark:border-white/15 text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/5",
  danger:
    "bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/30",
  success:
    "bg-green-500/20 border border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/30",
  ghost: "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-200 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg gap-1.5",
  md: "px-4 py-2.5 text-sm rounded-xl gap-2",
  lg: "px-6 py-3 text-base rounded-xl gap-2",
  icon: "p-2.5 rounded-xl",
  iconSm: "p-1.5 rounded-lg",
};

const baseClasses =
  "inline-flex items-center justify-center font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none";

export type ButtonProps = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  href?: string;
  className?: string;
  children?: React.ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading,
  href,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  const content = loading ? (
    <Loader2 size={size === "icon" || size === "iconSm" ? 16 : 18} className="animate-spin" />
  ) : Icon ? (
    <Icon size={16} />
  ) : null;

  const inner = (
    <>
      {content}
      {children}
    </>
  );

  const { disabled, type = "button", ...restAttrs } = rest;

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        {...(restAttrs as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type={type}
      disabled={loading || disabled}
      className={classes}
      {...restAttrs}
    >
      {inner}
    </button>
  );
}

export type IconButtonProps = {
  variant?: Variant;
  size?: "icon" | "iconSm";
  icon?: LucideIcon;
  iconClassName?: string;
  title?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({
  variant = "ghost",
  size = "icon",
  icon: Icon,
  iconClassName,
  title,
  className = "",
  ...rest
}: IconButtonProps) {
  const classes = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;
  const { disabled, type = "button", ...restAttrs } = rest;
  return (
    <button type={type} disabled={disabled} className={classes} title={title} {...restAttrs}>
      {Icon ? <Icon size={size === "iconSm" ? 14 : 18} className={iconClassName} /> : null}
    </button>
  );
}