"use client";
import { useEffect, useState } from "react";

interface RoleBadgeProps {
  user: any;
  size?: "sm" | "md" | "lg";
  showAnimation?: boolean;
}

export function RoleBadge({ user, size = "md", showAnimation = true }: RoleBadgeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!user) return null;

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[8px] md:text-[9px]",
    md: "px-2 py-0.5 md:px-2.5 md:py-1 text-[9px] md:text-[10px]",
    lg: "px-3 py-1 md:px-3.5 md:py-1.5 text-[10px] md:text-[11px]",
  };

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5 md:w-4 md:h-4";

  // ═══════════════════════════════════════════
  // 🟡 FOUNDER (Level 10) — с логотипом
  // ═══════════════════════════════════════════
  if (user.is_admin) {
    return (
      <span
        className={`badge-founder inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 text-black relative overflow-hidden ${showAnimation ? "animate-founder-glow" : ""}`}
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow: "0 4px 14px 0 rgba(255,255,255,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
        }}
      >
        {showAnimation && mounted && <div className="absolute inset-0 animate-shimmer" />}
        <img src="/role-icon.svg" alt="" className={`relative z-10 ${iconSize}`} style={{ filter: "brightness(0)" }} />
        <span className="relative z-10">Founder</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🔵 DEVELOPER (Level 9) — с логотипом
  // ═══════════════════════════════════════════
  if (user.is_moderator) {
    return (
      <span
        className={`badge-developer inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 border border-blue-400/50 text-white relative overflow-hidden ${showAnimation ? "animate-developer-pulse" : ""}`}
        style={{
          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          boxShadow: "0 4px 14px 0 rgba(59,130,246,0.4)",
        }}
      >
        <img src="/role-icon.svg" alt="" className={`relative z-10 ${iconSize}`} style={{ filter: "brightness(0) invert(1)" }} />
        <span className="relative z-10">Developer</span>
        <span className="badge-cursor relative z-10">_</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟢 SYSTEM (Level 11) — с логотипом
  // ═══════════════════════════════════════════
  if (user.is_system) {
    return (
      <span
        className={`badge-system inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 border border-green-400/50 text-white relative overflow-hidden`}
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
          boxShadow: "0 4px 14px 0 rgba(16,185,129,0.4)",
        }}
      >
        <img src="/role-icon.svg" alt="" className={`relative z-10 ${iconSize}`} style={{ filter: "brightness(0) invert(1) drop-shadow(0 0 4px #10b981)" }} />
        <span className="relative z-10">System</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // ⭐ СПЕЦ ОТДЕЛ (Level 8) — с логотипом и звездами
  // ═══════════════════════════════════════════
  if (user.role && user.role.level === 8) {
    const color = user.role.color || "#f59e0b";
    return (
      <span
        className={`badge-special-dept inline-flex items-center gap-1.5 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 border-2 text-white relative overflow-hidden ${showAnimation ? "animate-special-glow" : ""}`}
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}dd 50%, ${color}bb 100%)`,
          borderColor: color,
          boxShadow: `0 4px 14px 0 ${color}60, inset 0 1px 0 rgba(255,255,255,0.2)`,
        }}
      >
        {showAnimation && mounted && (
          <div className="absolute inset-0 animate-gradient-shift" style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)` }} />
        )}
        <img
          src="/role-icon.svg"
          alt=""
          className={`relative z-10 ${size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4 md:w-5 md:h-5"}`}
          style={{ filter: "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)" }}
        />
        <span className="relative z-10">{user.role.name}</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟣 ОБЫЧНЫЕ РОЛИ (Levels 1-7) — БЕЗ ИКОНОК
  // ═══════════════════════════════════════════
  if (user.role) {
    const color = user.role.color || "#8b5cf6";

    return (
      <span
        className={`badge-role inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 border text-white relative overflow-hidden`}
        style={{
          backgroundColor: color,
          borderColor: `${color}80`,
          boxShadow: `0 4px 14px 0 ${color}40`,
        }}
      >
        <span className="relative z-10">{user.role.name}</span>
      </span>
    );
  }

  // BANNED обрабатывается отдельно в UserProfilePage
  return null;
}