"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

interface RoleBadgeProps {
  user: any;
  activeBilletAssignment?: any; 
  size?: "sm" | "md" | "lg";
  showAnimation?: boolean;
}

export function RoleBadge({ user, activeBilletAssignment, size = "md", showAnimation = true }: RoleBadgeProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  // 🌗 До гидратации считаем тему тёмной (defaultTheme="dark") — SSR совпадёт
  const badgeIsDark = mounted ? resolvedTheme !== "light" : true;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!user) return null;

  // 🆕 Если проп не передан, берём активную кастомную плашку из объекта пользователя,
  // чтобы glow/анимации работали везде (посты, чаты, профиль), а не только там,
  // где компонент вызывают с явным prop.
  const assignment = activeBilletAssignment ?? user.active_billet_assignment;

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[8px] md:text-[9px]",
    md: "px-2 py-0.5 md:px-2.5 md:py-1 text-[9px] md:text-[10px]",
    lg: "px-3 py-1 md:px-3.5 md:py-1.5 text-[10px] md:text-[11px]",
  };

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5 md:w-4 md:h-4";

  // ═══════════════════════════════════════════
  // 🏆 1. ПРИОРИТЕТ: КАСТОМНАЯ ПЛАШКА (ИЗ АДМИНКИ)
  // ═══════════════════════════════════════════
  const isCustomActive = assignment?.is_active && 
    (!assignment.expires_at || new Date(assignment.expires_at) > new Date());

  // Хелпер: рендер плашки по данным badge (общий для кастомных и системных плашек)
  const renderBadgePlate = (badge: any) => {
    // 1. Базовый фон (БЕЗОПАСНАЯ инициализация)
    const bgStyle: React.CSSProperties = {};

    if (badge.bg_type === "solid") {
      bgStyle.backgroundColor = badge.bg_color || "#3b82f6";
    } else if (badge.bg_type === "gradient") {
      bgStyle.backgroundImage = badge.bg_gradient || `linear-gradient(135deg, ${badge.bg_color || "#3b82f6"}, #8b5cf6)`;
    } else if (badge.bg_type === "image" && badge.bg_image_url) {
      const mode = badge.bg_image_mode || "cover";
      bgStyle.backgroundImage = `url('${badge.bg_image_url}')`; // Кавычки внутри url() обязательны!
      bgStyle.backgroundSize = mode === "tile" ? "auto" : mode;
      bgStyle.backgroundPosition = "center";
      bgStyle.backgroundRepeat = mode === "tile" ? "repeat" : "no-repeat";
      bgStyle.backgroundColor = badge.bg_color || "#1a1a1a";
    } else if (!badge.bg_type) {
      // Системные плашки: если bg_type не задан — используем градиент или цвет
      if (badge.bg_gradient) bgStyle.backgroundImage = badge.bg_gradient;
      else bgStyle.backgroundColor = badge.bg_color || "#3b82f6";
    }

    // 2. Эффекты (БЕЗОПАСНАЯ конкатенация)
    if (badge.metallic_enabled) {
      const metallicGradient = "linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.1) 100%)";
      if (bgStyle.backgroundImage) {
        bgStyle.backgroundImage = `${bgStyle.backgroundImage}, ${metallicGradient}`;
      } else {
        bgStyle.backgroundImage = metallicGradient;
      }
    }

    // 3. Тени (Сборка в массив, чтобы не было лишних запятых)
    const shadows: string[] = [];
    if (badge.shadow_enabled) {
      shadows.push(`${badge.shadow_offset_x || 0}px ${badge.shadow_offset_y || 0}px ${badge.shadow_blur || 4}px ${badge.shadow_color || "rgba(0,0,0,0.5)"}`);
    }
    if (badge.inner_glow_enabled) {
      shadows.push(`inset 0 0 15px rgba(255,255,255,0.3)`);
    }
    if (badge.specular_enabled) {
      shadows.push(`inset 0 4px 6px rgba(255,255,255,0.6)`);
    }
    if (shadows.length > 0) {
      bgStyle.boxShadow = shadows.join(", ");
    }

    // 4. Обводка
    if (badge.border_width && badge.border_width > 0) {
      bgStyle.border = `${badge.border_width}px ${badge.border_style || "solid"} ${badge.border_color || "transparent"}`;
    }

    // 5. Свечение обводки (Filter)
    if (badge.border_glow && badge.border_color) {
      bgStyle.filter = `drop-shadow(0 0 ${badge.border_glow_intensity || 5}px ${badge.border_color})`;
    }

    // 6. Анимации (animation_flags - JSON массив)
    let anims: string[] = [];
    if (Array.isArray(badge.animation_flags)) anims = badge.animation_flags;
    else if (typeof badge.animation_flags === "string" && badge.animation_flags) {
      try { anims = JSON.parse(badge.animation_flags); } catch { anims = []; }
    }
    const animClasses = anims
      .map((a: string) => {
        switch (a) {
          case "pulse": return "animate-pulse";
          case "shimmer": return "animate-shimmer";
          case "glow": return "animate-founder-glow";
          case "float": return "animate-bounce";
          default: return "";
        }
      })
      .filter(Boolean)
      .join(" ");

    return (
      <span
        className={`inline-flex items-center gap-1.5 ${sizeClasses[size]} rounded-md font-bold uppercase tracking-wider shrink-0 relative overflow-hidden ${animClasses}`}
        style={{
          ...bgStyle,
          color: badge.text_color || "#ffffff",
        }}
      >
        {badge.icon_url && (
          <img src={badge.icon_url} alt="" className={`relative z-10 ${iconSize} object-contain`} />
        )}
        <span className="relative z-10 drop-shadow-md">
          {badge.text_content || badge.name}
        </span>
      </span>
    );
  };

  // 1. ПРИОРИТЕТ: КАСТОМНАЯ ПЛАШКА (из админки / самовыдача)
  if (isCustomActive && assignment?.override_priority) {
    return renderBadgePlate(assignment.badge);
  }

  // ═══════════════════════════════════════════
  // ⭐ 2. КАСТОМНЫЕ РОЛИ (Levels 8-11: Owner, Staff и т.д.)
  // Выданная роль перекрывает Founder/Developer — иначе её не видно у is_admin.
  // Рендер по цвету и названию самой роли.
  // ═══════════════════════════════════════════
  if (user.role && user.role.level >= 8) {
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
        />
        <span className="relative z-10">{user.role.name}</span>
      </span>
    );
  }

  // ═══════════════════════════════════════════
  // 🟡 3. FOUNDER (Level 10 / is_admin)
  // ═══════════════════════════════════════════
  if (user.is_admin) {
    // 🌗 Инверсия по теме: dark — белая плашка с чёрным текстом,
    // light — чёрная плашка с белым текстом
    return (
      <span
        className={`badge-founder inline-flex items-center gap-1 ${sizeClasses[size]} rounded-md font-black uppercase tracking-widest shrink-0 relative overflow-hidden ${badgeIsDark ? "text-black" : "text-white"} ${showAnimation ? "animate-founder-glow" : ""}`}
        style={
          badgeIsDark
            ? {
                background: "linear-gradient(135deg, #ffffff 0%, #e5e7eb 100%)",
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow: "0 4px 14px 0 rgba(255,255,255,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
              }
            : {
                background: "linear-gradient(135deg, #26221a 0%, #454034 100%)",
                border: "1px solid rgba(38,34,26,0.85)",
                boxShadow: "0 4px 14px 0 rgba(38,34,26,0.35)",
              }
        }
      >
        {showAnimation && mounted && <div className="absolute inset-0 animate-shimmer" />}
        <img src="/role-icon.svg" alt="" className={`relative z-10 ${iconSize}`} style={{ filter: badgeIsDark ? "brightness(0)" : "brightness(0) invert(1)" }} />
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