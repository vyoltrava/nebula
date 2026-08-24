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

// === ВОЛНА ПО КОНТУРУ (SVG) ===
function PerimeterWave({ color, speed = "normal", children, extraDecorations }: { 
  color: string; 
  speed?: "normal" | "slow";
  children: ReactNode; 
  extraDecorations?: ReactNode; 
}) {
  return (
    <div className="relative inline-block">
      {/* SVG-волна строго по контуру скругленного края */}
      <svg 
        className="absolute -inset-[3px] w-[calc(100%+24px)] h-[calc(100%+24px)] pointer-events-none z-0 overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="3"
          y="3"
          width="calc(100% - 24px)"
          height="calc(100% - 24px)"
          rx="16" // Скругление совпадает с контейнером аватарки
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          className={speed === "slow" ? "animate-perimeter-wave-slow" : "animate-perimeter-wave"}
          style={{
            strokeDasharray: "60 300",
            filter: `drop-shadow(0 0 4px ${color}) drop-shadow(0 0 8px ${color}60)`,
          }}
        />
      </svg>

      {/* Контейнер аватарки: УБРАНЫ bg и border, оставлено только скругление и обрезка */}
      <div className="relative z-10 rounded-xl overflow-hidden">
        {children}
        {extraDecorations}
      </div>
    </div>
  );
}

export function AvatarFrame({ children, user, size = 128, availableBadges = [], canEditBadge = false, onBadgeClick }: AvatarFrameProps) {
  if (!user) return <>{children}</>;

  const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);

  const customBadge = user.custom_badge_url ? {
    id: -1,
    icon_url: user.custom_badge_url,
    glow_color: "#8b5cf6",
    enable_ring: true,
    enable_glow: true,
    name: "Custom Badge"
  } : null;

  let userBadge = customBadge || 
                  availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                  availableBadges.find((b: any) => b.user_id === user.id) ||
                  availableBadges.find((b: any) => b.role_id === user.role?.id);

  // Виртуальный бейдж для 10 уровня (Founder), если не найден в списке
  if (!userBadge && level === 10) {
     userBadge = {
         id: 999,
         icon_url: "/hello-kitty.png",
         glow_color: "#ffffff",
         enable_ring: true,
         enable_glow: true,
         name: "Founder"
     };
  }

  const glowColor = userBadge?.glow_color || user.role?.color || "#8b5cf6";
  const showRing = userBadge?.enable_ring || (level >= 6 && level <= 9) || level === 11;

  return (
    <div className="relative inline-block">
      
      {/* === РЕНДЕРИНГ ЭФФЕКТОВ И АВАТАРКИ === */}
      {showRing ? (
        <PerimeterWave 
            color={glowColor} 
            speed={level === 10 ? "slow" : "normal"}
            extraDecorations={
                level === 9 ? (
                    <>
                      <span className="absolute top-1.5 left-1.5 text-[10px] font-mono text-blue-400 animate-pulse">&lt;/&gt;</span>
                      <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-blue-300 animate-pulse">{`{ }`}</span>
                    </>
                ) : level === 11 ? (
                    <>
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-green-400 font-bold">01</span>
                        <span className="absolute top-1.5 right-1.5 text-[9px] font-mono text-green-300 font-bold">10</span>
                    </>
                ) : null
            }
        >
          {children}
        </PerimeterWave>
      ) : (
        <div className="relative z-10 rounded-xl overflow-hidden">
          {children}
        </div>
      )}

      {/* === ЗНАЧОК (БЕЗ ФОНА И ОБВОДКИ, ТОЛЬКО СВЕЧЕНИЕ ПОД КОНТУР) === */}
      {userBadge && (
        <div 
          className="absolute z-30 select-none"
          style={{ top: '-10px', left: '-10px' }} // Чуть ближе к углу, так как убрали рамку
        >
          <div 
            className={`relative flex items-center justify-center p-1 ${
              canEditBadge ? 'pointer-events-auto cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'
            }`}
            onClick={canEditBadge ? onBadgeClick : undefined}
            title={canEditBadge ? "Нажми, чтобы сменить значок" : userBadge.name}
          >
            {/* Свечение строго под иконкой */}
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
            
            {/* Сама иконка без рамок и фона */}
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