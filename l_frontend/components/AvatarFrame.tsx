"use client";
import { ReactNode } from "react";

interface AvatarFrameProps {
  children: ReactNode;
  user: any;
  size?: number;
  availableBadges?: any[];
  canEditBadge?: boolean;
  onBadgeClick?: () => void;
}

export function AvatarFrame({ 
  children, 
  user, 
  size = 128, 
  availableBadges = [], 
  canEditBadge = false, 
  onBadgeClick
}: AvatarFrameProps) {
  if (!user) return <>{children}</>;

  const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);

  // Логика выбора значка в углу аватарки
  const sysBadge = user.system_badge; // 🆕 отредактированная плашка из /admin/badges/system
  let userBadge = (user.custom_badge_url ? {
    id: -1,
    icon_url: user.custom_badge_url,
    glow_color: "#8b5cf6",
    enable_ring: true,
    enable_glow: true,
    name: "Custom Badge"
  } : null) ||
  availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
  availableBadges.find((b: any) => b.user_id === user.id) ||
  availableBadges.find((b: any) => b.role_id === user.role?.id);

  // 🆕 Приоритет: отредактированная системная плашка уровня 9-11 (инконка + цвет рамки)
  if (!userBadge && [8, 9, 10, 11].includes(level) && sysBadge?.icon_url) {
    userBadge = {
      id: 999,
      icon_url: sysBadge.icon_url,
      glow_color: sysBadge.border_color || sysBadge.bg_color || "#ffffff",
      enable_ring: true,
      enable_glow: sysBadge.border_glow ?? true,
      name: sysBadge.name || "Badge"
    };
  }

  // Фоллбэк для Founder
  if (!userBadge && level === 10) {
     userBadge = {
         id: 999,
         icon_url: sysBadge?.icon_url || "/hello-kitty.png",
         glow_color: sysBadge?.border_color || sysBadge?.bg_color || "#ffffff",
         enable_ring: true,
         enable_glow: sysBadge?.border_glow ?? true,
         name: sysBadge?.name || "Founder"
     };
  }

  const glowColor = userBadge?.glow_color || sysBadge?.border_color || sysBadge?.bg_color || user.role?.color || "#8b5cf6";
  
  // 🆕 ИСПРАВЛЕНО: Кольцо показывается ТОЛЬКО у:
  // - Level 8, 9, 10, 11 (всегда)
  // - Остальные - только если у бейджа enable_ring: true
  const hasPermanentRing = level === 8 || level === 9 || level === 10 || level === 11;
  const showRing = hasPermanentRing || (userBadge?.enable_ring ?? false);

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      {showRing ? (
        <div className="relative w-full h-full rounded-xl">
          
          {/* ══════════════════════════════════════════════════ */}
          {/*  ЭФФЕКТ "ОРБИТА / ВОЛНА" ЧЕРЕЗ SVG */}
          {/* ═══════════════════════════════════════════════════ */}
          <svg 
            className="absolute inset-0 w-full h-full overflow-visible z-0 pointer-events-none"
            style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          >
            {/* 1. Медленная "планета" с длинным хвостом */}
            <rect
              x="0" y="0" width="100%" height="100%" rx="12"
              fill="none"
              stroke={glowColor} 
              strokeWidth="3"
              strokeDasharray="40 220"
              className="animate-orbit-slow"
              style={{ opacity: 0.8 }}
            />
            
            {/* 2. Быстрая яркая вспышка (Ядро волны) */}
            <rect
              x="0" y="0" width="100%" height="100%" rx="12"
              fill="none"
              stroke={glowColor}
              strokeWidth="2"
              strokeDasharray="20 240"
              className="animate-orbit-fast"
              style={{ opacity: 0.9 }}
            />

            {/* 3. Обратное движение (для эффекта "дыхания") */}
            <rect
              x="0" y="0" width="100%" height="100%" rx="12"
              fill="none"
              stroke={glowColor}
              strokeWidth="1.5"
              strokeDasharray="10 250"
              className="animate-orbit-reverse"
              style={{ opacity: 0.5 }}
            />
          </svg>

          {/* 4. Дополнительные декорации (уровень 9/11) */}
          {level === 9 && (
            <div className="absolute inset-0 z-20 pointer-events-none rounded-xl overflow-hidden">
              <span className="absolute top-1.5 left-1.5 text-[10px] font-mono text-blue-400 animate-pulse">&lt;/&gt;</span>
              <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-blue-300 animate-pulse">{`{ }`}</span>
            </div>
          )}
          {level === 11 && (
            <div className="absolute inset-0 z-20 pointer-events-none rounded-xl overflow-hidden">
              <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-green-400 font-bold">01</span>
              <span className="absolute top-1.5 right-1.5 text-[9px] font-mono text-green-300 font-bold">10</span>
            </div>
          )}

          {/* 5. Внутренний контейнер для аватарки (ДЕТИ) */}
          <div className="relative z-10 rounded-xl w-full h-full">
            {children}
          </div>

          <style jsx>{`
            @keyframes orbit-slow {
              to { stroke-dashoffset: -260; }
            }
            @keyframes orbit-fast {
              to { stroke-dashoffset: -260; }
            }
            @keyframes orbit-reverse {
              to { stroke-dashoffset: 260; }
            }

            .animate-orbit-slow {
              animation: orbit-slow 4s linear infinite;
            }
            .animate-orbit-fast {
              animation: orbit-fast 2.5s linear infinite;
            }
            .animate-orbit-reverse {
              animation: orbit-reverse 6s linear infinite;
            }
          `}</style>
        </div>
      ) : (
        <div className="relative z-10 rounded-xl overflow-hidden w-full h-full">
          {children}
        </div>
      )}

      {/* === ЗНАЧОК В УГЛУ АВАТАРКИ === */}
      {userBadge && (
        <div 
          className="absolute z-30 select-none"
          style={{ top: '-8px', left: '-8px' }}
        >
          <div 
            className={`relative flex items-center justify-center p-1 ${
              canEditBadge ? 'pointer-events-auto cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'
            }`}
            onClick={canEditBadge ? onBadgeClick : undefined}
            title={canEditBadge ? "Нажми, чтобы сменить значок" : userBadge.name}
          >
            {userBadge.enable_glow && (
              <div 
                className="absolute inset-0 rounded-md"
                style={{
                  background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor}50 60%, transparent 80%)`,
                  filter: `blur(6px)`,
                  transform: `scale(1.3)`,
                  zIndex: -1,
                }}
              />
            )}
            <img
              src={userBadge.icon_url}
              alt={userBadge.name || "Badge"}
              className="w-8 h-8 object-contain drop-shadow-md"
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}