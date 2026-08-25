"use client";
import { useEffect, useState } from "react";

interface RoleBadgeProps {
  user: any;
  activeCustomBadgeAssignment?: any; 
  size?: "sm" | "md" | "lg";
  showAnimation?: boolean;
}

export function RoleBadge({ user, activeCustomBadgeAssignment, size = "md", showAnimation = true }: RoleBadgeProps) {
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
  // 🏆 1. ПРИОРИТЕТ: КАСТОМНАЯ ПЛАШКА (ИЗ АДМИНКИ)
  // ═══════════════════════════════════════════
  const isCustomActive = activeCustomBadgeAssignment?.is_active && 
    (!activeCustomBadgeAssignment.expires_at || new Date(activeCustomBadgeAssignment.expires_at) > new Date());

  if (isCustomActive && activeCustomBadgeAssignment?.override_priority) {
    let config: any = {}; // Используем any, чтобы TS не ругался на динамические поля из JSON
    try {
      config = JSON.parse(activeCustomBadgeAssignment.badge?.badge_config || "{}");
    } catch (e) {
      console.error("Failed to parse badge config", e);
    }

    const bgColor = config.bg_type === 'solid' ? config.bg_color : 'transparent';
    const bgImage = config.bg_type === 'gradient' ? config.bg_gradient : (config.bg_type === 'image' ? `url(${config.bg_image_url})` : undefined);
    const border = config.border_width ? `${config.border_width}px ${config.border_style || 'solid'} ${config.border_color || 'transparent'}` : '1px solid rgba(255,255,255,0.2)';
    const boxShadow = config.shadow_enabled ? `${config.shadow_offset_x || 0}px ${config.shadow_offset_y || 0}px ${config.shadow_blur || 4}px ${config.shadow_color}` : '0 4px 14px 0 rgba(0,0,0,0.3)';

    return (
      <span
        className={`inline-flex items-center gap-1.5 ${sizeClasses[size]} rounded-md font-bold uppercase tracking-wider shrink-0 relative overflow-hidden text-white`}
        style={{
          backgroundColor: bgColor,
          backgroundImage: bgImage,
          backgroundSize: config.bg_image_mode || 'cover',
          border: border,
          boxShadow: boxShadow,
        }}
      >
        {config.icon_url && (
          <img src={config.icon_url} alt="" className={`relative z-10 ${iconSize} object-contain`} />
        )}
        <span className="relative z-10 drop-shadow-md">
          {config.text_content || activeCustomBadgeAssignment.badge?.name || "Badge"}
        </span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟡 2. FOUNDER (Level 10 / is_admin)
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
  // 🔵 3. DEVELOPER / MODERATOR (Level 9)
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
  // 🛡️ 4. TRELOD (Official)
  // ═══════════════════════════════════════════
  if (user.username === "trelod") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 ${sizeClasses[size]} rounded-md font-bold uppercase tracking-wider shrink-0 border border-zinc-600/50 text-zinc-100 relative overflow-hidden`}
        style={{
          background: "linear-gradient(135deg, #18181b 0%, #27272a 50%, #18181b 100%)",
          boxShadow: "0 0 15px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <svg className={`relative z-10 ${iconSize} text-zinc-300`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="relative z-10 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-400">
          Official
        </span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // ⭐ 5. СПЕЦ ОТДЕЛ (Level 8)
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
  // 🟣 6. ОБЫЧНЫЕ РОЛИ (Levels 1-7)
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

  return null;
}