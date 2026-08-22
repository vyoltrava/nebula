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

export function AvatarFrame({ children, user, size = 128, availableBadges = [], canEditBadge = false, onBadgeClick }: AvatarFrameProps) {
  if (!user) return <>{children}</>;

  const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);

  // 1. Если есть загруженный пользователем значок - используем его
  const customBadge = user.custom_badge_url ? {
    id: -1,
    icon_url: user.custom_badge_url,
    glow_color: "#8b5cf6",
    enable_ring: true,
    enable_glow: true,
  } : null;

  // 2. Ищем активный значок: кастомный > выбранный вручную > выданный по ID > выданный по роли
  const userBadge = customBadge || 
                    availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                    availableBadges.find((b: any) => b.user_id === user.id) ||
                    availableBadges.find((b: any) => b.role_id === user.role?.id);

  // 3. Если значка нет, используем старую логику по уровням (fallback)
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
      {/* ВРАЩАЮЩЕЕСЯ КОЛЬЦО (если включено) */}
      {userBadge.enable_ring && (
        <div
          className="absolute -inset-[5px] rounded-full animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, ${glowColor}, ${glowColor}80, transparent, ${glowColor}80, ${glowColor})`,
          }}
        />
      )}

      {/* Аватарка */}
      <div className="relative">
        {children}
      </div>

      {/* ПУЛЬСАЦИЯ СВЕЧЕНИЯ (исправлено для Firefox - без filter в анимации) */}
      {userBadge.enable_glow && (
        <div className="absolute -bottom-2 -right-2 w-9 h-9 pointer-events-none select-none z-10 badge-glow-effect">
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${glowColor}80 0%, transparent 70%)`,
            }}
          />
        </div>
      )}

      {/* 🆕 ЗНАЧОК СВЕРХУ ПО ЦЕНТРУ СО СВЕТЯЩЕЙСЯ ПОДЛОЖКОЙ */}
      <div 
        className={`absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow select-none z-10 ${
          canEditBadge ? 'pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity' : 'pointer-events-none'
        }`}
        onClick={canEditBadge ? onBadgeClick : undefined}
        title={canEditBadge ? "Нажми, чтобы сменить значок" : ""}
      >
        {/* Светящаяся подложка под значком */}
        <div 
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor}80 40%, transparent 70%)`,
            filter: `blur(3px)`,
            transform: `scale(1.3)`,
          }}
        />
        {/* Сам значок */}
        <img
          src={userBadge.icon_url}
          alt={userBadge.name}
          className="relative w-full h-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

// === СТАРЫЕ ЭФФЕКТЫ (Fallback) ===
function Level67Effect({ user, children }: { user: any; children: ReactNode }) {
  const color = user.role?.color || "#8b5cf6";
  return <div className="relative"><div className="absolute inset-0 rounded-full animate-role-aura" style={{ boxShadow: `0 0 20px 4px ${color}40` }} />{children}</div>;
}
function Level8Effect({ user, children }: { user: any; children: ReactNode }) {
  const color = user.role?.color || "#f59e0b";
  return <div className="relative"><div className="absolute -inset-[4px] rounded-full animate-spin-slow" style={{ background: `conic-gradient(from 0deg, ${color}, ${color}80, transparent, ${color}80, ${color})` }} /><div className="relative rounded-full border-[3px] border-[#171717]">{children}</div></div>;
}
function Level9Effect({ children }: { children: ReactNode }) {
  return <div className="relative"><div className="absolute -inset-[4px] rounded-full animate-spin-slow" style={{ background: "conic-gradient(from 0deg, #3b82f6, #60a5fa, transparent, #60a5fa, #3b82f6)" }} /><div className="relative rounded-full border-[3px] border-[#171717]">{children}</div><span className="absolute -top-1 -right-1 text-[10px] font-mono text-blue-400 animate-float-1">&lt;/&gt;</span><span className="absolute -bottom-1 -left-1 text-[10px] font-mono text-blue-300 animate-float-2">{}</span></div>;
}
function Level10Effect({ children }: { children: ReactNode }) {
  return <div className="relative"><div className="absolute -inset-[5px] rounded-full animate-spin-slow" style={{ background: "conic-gradient(from 0deg, #ffffff, #f3f4f6, #e5e7eb, #f3f4f6, #ffffff)" }} /><div className="relative">{children}</div><div className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow pointer-events-none select-none z-10"><img src="/hello-kitty.png" alt="" className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]" draggable={false} /></div></div>;
}
function Level11Effect({ children }: { children: ReactNode }) {
  return <div className="relative"><div className="absolute -inset-[4px] rounded-full animate-spin-reverse" style={{ background: "conic-gradient(from 0deg, #10b981, #34d399, transparent, #34d399, #10b981)" }} /><div className="relative rounded-full border-[3px] border-[#171717]">{children}</div><span className="absolute top-0 right-0 text-[8px] font-mono text-green-400 animate-float-1">01</span><span className="absolute bottom-0 left-0 text-[8px] font-mono text-green-300 animate-float-2">10</span></div>;
}