"use client";
import { ReactNode } from "react";

interface AvatarFrameProps {
  children: ReactNode;
  user: any;
  size?: number;
  availableBadges?: any[]; // 🆕 Список всех доступных значков
}

export function AvatarFrame({ children, user, size = 128, availableBadges = [] }: AvatarFrameProps) {
  if (!user) return <>{children}</>;

  const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);

  // 🎯 1. Ищем активный значок: либо выбранный пользователем, либо привязанный к его роли
  const userBadge = availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                    availableBadges.find((b: any) => b.role_id === user.role?.id);

  // 🎯 2. Если значка нет, используем старую логику по уровням (fallback)
  if (!userBadge) {
    if (level <= 5) return <>{children}</>;
    if (level <= 7) return <Level67Effect user={user}>{children}</Level67Effect>;
    if (level === 8) return <Level8Effect user={user}>{children}</Level8Effect>;
    if (level === 9) return <Level9Effect>{children}</Level9Effect>;
    if (level === 10) return <Level10Effect>{children}</Level10Effect>;
    if (level === 11) return <Level11Effect>{children}</Level11Effect>;
    return <>{children}</>;
  }

  // 🎯 3. Рендер кастомного значка с эффектами
  const glowColor = userBadge.glow_color || user.role?.color || "#8b5cf6";
  
  let glowFilter = `drop-shadow(0 0 8px ${glowColor}99) drop-shadow(0 0 16px ${glowColor}44)`;
  let animationClass = "";

  if (userBadge.effect_type === "gold") {
    glowFilter = `drop-shadow(0 0 10px rgba(255, 215, 0, 0.9)) drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))`;
    animationClass = "animate-pulse";
  } else if (userBadge.effect_type === "pulse") {
    glowFilter = `drop-shadow(0 0 12px rgba(255, 255, 255, 0.9)) drop-shadow(0 0 24px rgba(255, 255, 255, 0.6))`;
    animationClass = "animate-ping-slow";
  }

  return (
    <div className="relative">
      {/* Кольцо уровня (опционально, можно убрать, если значок самодостаточен) */}
      {level >= 6 && !userBadge.effect_type && (
        <div
          className="absolute -inset-[4px] rounded-full animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, ${glowColor}, ${glowColor}80, transparent, ${glowColor}80, ${glowColor})`,
            filter: `drop-shadow(0 0 8px ${glowColor}80)`,
          }}
        />
      )}

      {/* Аватарка */}
      <div className="relative rounded-full border-[3px] border-[#171717]">
        {children}
      </div>

      {/* 🆕 ЗНАЧОК С ДИНАМИЧЕСКИМ СВЕЧЕНИЕМ */}
      <div 
        className={`absolute -bottom-2 -right-2 w-9 h-9 pointer-events-none select-none z-10 ${animationClass}`}
        style={{ 
          filter: glowFilter,
          animation: userBadge.effect_type === "pulse" ? "ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite" : undefined 
        }}
      >
        <img
          src={userBadge.icon_url}
          alt={userBadge.name}
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

// === СТАРЫЕ ЭФФЕКТЫ (Fallback, если у пользователя нет бейджа, но есть уровень) ===
function Level67Effect({ user, children }: { user: any; children: ReactNode }) {
  const color = user.role?.color || "#8b5cf6";
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-full animate-role-aura" style={{ boxShadow: `0 0 20px 4px ${color}40` }} />
      {children}
    </div>
  );
}
function Level8Effect({ user, children }: { user: any; children: ReactNode }) {
  const color = user.role?.color || "#f59e0b";
  return (
    <div className="relative">
      <div className="absolute -inset-[4px] rounded-full animate-spin-slow" style={{ background: `conic-gradient(from 0deg, ${color}, ${color}80, transparent, ${color}80, ${color})`, filter: `drop-shadow(0 0 8px ${color}80)` }} />
      <div className="relative rounded-full border-[3px] border-[#171717]">{children}</div>
    </div>
  );
}
function Level9Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-[4px] rounded-full animate-spin-slow" style={{ background: "conic-gradient(from 0deg, #3b82f6, #60a5fa, transparent, #60a5fa, #3b82f6)", filter: "drop-shadow(0 0 12px rgba(59,130,246,0.6))" }} />
      <div className="relative rounded-full border-[3px] border-[#171717]">{children}</div>
      <span className="absolute -top-1 -right-1 text-[10px] font-mono text-blue-400 animate-float-1">&lt;/&gt;</span>
      <span className="absolute -bottom-1 -left-1 text-[10px] font-mono text-blue-300 animate-float-2">{}</span>
    </div>
  );
}
function Level10Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-[5px] rounded-full animate-spin-slow" style={{ background: "conic-gradient(from 0deg, #ffffff, #f3f4f6, #e5e7eb, #f3f4f6, #ffffff)", filter: "drop-shadow(0 0 20px rgba(255,255,255,0.9))" }} />
      <div className="relative rounded-full border-[3px] border-[#171717]">{children}</div>
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow pointer-events-none select-none z-10">
        <img src="/hello-kitty.png" alt="" className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]" draggable={false} />
      </div>
    </div>
  );
}
function Level11Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute -inset-[4px] rounded-full animate-spin-reverse" style={{ background: "conic-gradient(from 0deg, #10b981, #34d399, transparent, #34d399, #10b981)", filter: "drop-shadow(0 0 12px rgba(16,185,129,0.6))" }} />
      <div className="relative rounded-full border-[3px] border-[#171717]">{children}</div>
      <span className="absolute top-0 right-0 text-[8px] font-mono text-green-400 animate-float-1">01</span>
      <span className="absolute bottom-0 left-0 text-[8px] font-mono text-green-300 animate-float-2">10</span>
    </div>
  );
}