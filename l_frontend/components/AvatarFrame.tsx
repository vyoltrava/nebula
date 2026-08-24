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

function PerimeterWave({ color, speed = "normal", children, extraDecorations }: { 
  color: string; 
  speed?: "normal" | "slow";
  children: ReactNode; 
  extraDecorations?: ReactNode; 
}) {
  return (
    <div className="relative">
      <svg 
        className="absolute -inset-[4px] w-[calc(100%+32px)] h-[calc(100%+32px)] pointer-events-none z-0 overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="4"
          y="4"
          width="calc(100% - 32px)"
          height="calc(100% - 32px)"
          rx="16"
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

      <div className="relative z-10 rounded-xl overflow-hidden bg-[#171717] border-[2px] border-[#171717]">
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
    enable_glow: false, // По умолчанию выключено для кастомных!
  } : null;

  const userBadge = customBadge || 
                    availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                    availableBadges.find((b: any) => b.user_id === user.id) ||
                    availableBadges.find((b: any) => b.role_id === user.role?.id);

  if (!userBadge) {
    if (level <= 5) return <>{children}</>;
    if (level <= 7) return <Level67Effect user={user}>{children}</Level67Effect>;
    if (level === 8) return <Level8Effect user={user}>{children}</Level8Effect>;
    if (level === 9) return <Level9Effect>{children}</Level9Effect>;
    if (level === 10) return <Level10Effect>{children}</Level10Effect>;
    if (level === 11) return <Level11Effect>{children}</Level11Effect>;
    return <>{children}</>;
  }

  const glowColor = userBadge.glow_color || user.role?.color || "#8b5cf6";
  
  return (
    <div className="relative">
      {userBadge.enable_ring && (
        <PerimeterWave color={glowColor}>
          {children}
        </PerimeterWave>
      )}

      {!userBadge.enable_ring && (
        <div className="relative z-10 rounded-xl overflow-hidden bg-[#171717] border-[2px] border-[#171717]">
          {children}
        </div>
      )}

      {/* ЗНАЧОК В ЛЕВОМ ВЕРХНЕМ УГЛУ */}
      <div 
        className="absolute z-30 select-none"
        style={{ top: '-12px', left: '-12px' }}
      >
        <div 
          className={`w-9 h-9 rounded-full bg-[#171717] border-2 border-[#171717] flex items-center justify-center shadow-lg ${
            canEditBadge ? 'pointer-events-auto cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'
          }`}
          onClick={canEditBadge ? onBadgeClick : undefined}
          title={canEditBadge ? "Нажми, чтобы сменить значок" : ""}
        >
          {/* Свечение ТОЛЬКО если enable_glow === true */}
          {userBadge.enable_glow && (
            <div 
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor}60 50%, transparent 70%)`,
                filter: `blur(4px)`,
                transform: `scale(1.5)`,
                zIndex: -1,
              }}
            />
          )}
          
          <img
            src={userBadge.icon_url}
            alt={userBadge.name || "Badge"}
            className="w-6 h-6 object-contain"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

function Level67Effect({ user, children }: { user: any; children: ReactNode }) {
  return <PerimeterWave color={user.role?.color || "#8b5cf6"}>{children}</PerimeterWave>;
}

function Level8Effect({ user, children }: { user: any; children: ReactNode }) {
  return <PerimeterWave color={user.role?.color || "#f59e0b"}>{children}</PerimeterWave>;
}

function Level9Effect({ children }: { children: ReactNode }) {
  return (
    <PerimeterWave 
      color="#3b82f6" 
      extraDecorations={
        <>
          <span className="absolute top-1.5 left-1.5 text-[10px] font-mono text-blue-400 animate-pulse">&lt;/&gt;</span>
          <span className="absolute bottom-1.5 right-1.5 text-[10px] font-mono text-blue-300 animate-pulse">{`{ }`}</span>
        </>
      }
    >
      {children}
    </PerimeterWave>
  );
}

function Level10Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <PerimeterWave color="#ffffff" speed="slow">
        {children}
      </PerimeterWave>
      {/* Hello Kitty — ТОЧНО ТАК ЖЕ как кастомные */}
      <div 
        className="absolute z-30 pointer-events-none select-none animate-bounce-slow"
        style={{ top: '-12px', left: '-12px' }}
      >
        <div className="w-9 h-9 rounded-full bg-[#171717] border-2 border-[#171717] flex items-center justify-center shadow-lg">
          <img src="/hello-kitty.png" alt="VIP" className="w-6 h-6 object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]" draggable={false} />
        </div>
      </div>
    </div>
  );
}

function Level11Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <svg 
        className="absolute -inset-[4px] w-[calc(100%+32px)] h-[calc(100%+32px)] pointer-events-none z-0 overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x="4" y="4" width="calc(100% - 32px)" height="calc(100% - 32px)" rx="16"
          fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round"
          className="animate-perimeter-wave-slow"
          style={{
            strokeDasharray: "40 150",
            filter: `drop-shadow(0 0 6px #10b981)`,
          }}
        />
      </svg>
      <div className="relative z-10 rounded-xl overflow-hidden bg-[#171717] border-[2px] border-[#171717]">
        {children}
        <span className="absolute top-1.5 left-1.5 text-[9px] font-mono text-green-400 font-bold">01</span>
        <span className="absolute top-1.5 right-1.5 text-[9px] font-mono text-green-300 font-bold">10</span>
      </div>
    </div>
  );
}