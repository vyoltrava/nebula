"use client";
import { ShieldCheck, Crown, Sparkles, Star, Zap, Shield } from "lucide-react";
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

  const iconSize = { sm: 8, md: 9, lg: 11 };

  // ═══════════════════════════════════════════
  // 🟡 FOUNDER (Level 10)
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
        {showAnimation && <div className="absolute inset-0 animate-shimmer" />}
        <Crown size={iconSize[size]} className="relative z-10" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
        <span className="relative z-10">Founder</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🔵 DEVELOPER (Level 9)
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
        <ShieldCheck size={iconSize[size]} className="relative z-10" />
        <span className="relative z-10">Developer</span>
        <span className="badge-cursor relative z-10">_</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟢 SYSTEM (Level 11)
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
        <Zap size={iconSize[size]} className="relative z-10" />
        <span className="relative z-10">System</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // ⭐ СПЕЦ ОТДЕЛ (Level 8) — менеджеры, дизайнеры, комьюнити
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
        {showAnimation && (
          <div className="absolute inset-0 animate-gradient-shift" style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)` }} />
        )}
        <Star
          size={iconSize[size] + 2}
          className="relative z-10"
          fill="currentColor"
          style={{ filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color}80)` }}
        />
        <span className="relative z-10">{user.role.name}</span>
        {showAnimation && (
          <>
            <Sparkles size={iconSize[size] - 2} className="absolute top-0 right-1 opacity-60 animate-sparkle-1" />
            <Sparkles size={iconSize[size] - 3} className="absolute bottom-0 left-1 opacity-40 animate-sparkle-2" />
          </>
        )}
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟣 ОБЫЧНЫЕ РОЛИ (Levels 1-7)
  // ═══════════════════════════════════════════
  if (user.role) {
    const color = user.role.color || "#8b5cf6";
    const level = user.role.level || 1;
    const isHigh = level >= 6;

    return (
      <span
        className={`badge-role inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 border text-white relative overflow-hidden ${isHigh && showAnimation ? "animate-role-pulse" : ""}`}
        style={{
          backgroundColor: color,
          borderColor: `${color}80`,
          boxShadow: isHigh ? `0 4px 14px 0 ${color}40, 0 0 20px ${color}30` : `0 4px 14px 0 ${color}40`,
        }}
      >
        {isHigh && showAnimation && (
          <div className="absolute inset-0 opacity-20" style={{ background: `linear-gradient(135deg, transparent, rgba(255,255,255,0.4), transparent)` }} />
        )}
        {isHigh && (
          <Shield size={iconSize[size]} className="relative z-10" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }} />
        )}
        <span className="relative z-10">{user.role.name}</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🔴 BANNED
  // ═══════════════════════════════════════════
  if (user.is_banned) {
    return (
      <span className={`badge-banned inline-flex items-center gap-1 ${sizeClasses[size]} rounded font-black uppercase shrink-0 border border-red-500/30 bg-red-500/20 text-red-400`}>
        BANNED
      </span>
    );
  }

  return null;
}