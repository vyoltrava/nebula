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

  // 3. Если значка нет, используем логику по уровням (fallback)
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
      {/* === НОВЫЙ ЭФФЕКТ: БЕГУЩАЯ ВОЛНА И ПУЛЬСАЦИЯ ПО КОНТУРУ === */}
      {userBadge.enable_ring && (
        <>
          {/* Слой 1: Вращающаяся волна и мягкое свечение (позади всего) */}
          <div className="absolute -inset-[3px] rounded-xl z-0">
            <div
              className="absolute inset-0 rounded-xl animate-spin-slow"
              style={{
                // Градиент с длинным "хвостом" создает эффект бегущего блика/волны, а не сплошного вращения
                background: `conic-gradient(from 0deg, transparent 0%, transparent 65%, ${glowColor}60 85%, ${glowColor} 100%)`,
                filter: 'blur(1.5px)', // Смягчает волну, делая её "премиальной"
              }}
            />
            {/* Слой 2: Эффект "дыхания" (пульсация интенсивности) */}
            <div 
              className="absolute inset-0 rounded-xl animate-pulse"
              style={{ boxShadow: `0 0 25px 5px ${glowColor}30` }}
            />
          </div>

          {/* Слой 3: Маска, перекрывающая центр. Оставляет видимым только край (рамку толщиной 3px) */}
          <div className="absolute inset-0 rounded-xl border-[3px] border-[#171717] z-10 pointer-events-none" />
        </>
      )}

      {/* === АВАТАРКА === */}
      <div className={`relative z-20 rounded-xl overflow-hidden bg-[#171717] ${!userBadge.enable_ring ? 'border-[3px] border-[#171717]' : ''}`}>
        {children}
      </div>

      {/* === ПУЛЬСАЦИЯ СВЕЧЕНИЯ (верхняя точка, исправлено для Firefox) === */}
      {userBadge.enable_glow && (
        <div 
          className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 pointer-events-none select-none z-30 badge-glow-effect"
        >
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${glowColor}80 0%, transparent 70%)`,
            }}
          />
        </div>
      )}

      {/* === ЗНАЧОК СВЕРХУ ПО ЦЕНТРУ === */}
      <div 
        className={`absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow select-none z-30 ${
          canEditBadge ? 'pointer-events-auto cursor-pointer hover:opacity-80 transition-opacity' : 'pointer-events-none'
        }`}
        onClick={canEditBadge ? onBadgeClick : undefined}
        title={canEditBadge ? "Нажми, чтобы сменить значок" : ""}
      >
        {/* Светящаяся подложка под значком */}
        {userBadge.enable_glow && (
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor}80 40%, transparent 70%)`,
              filter: `blur(3px)`,
              transform: `scale(1.3)`,
            }}
          />
        )}
        {/* Сам значок */}
        <img
          src={userBadge.icon_url}
          alt={userBadge.name || "Badge"}
          className="relative w-full h-full object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}

// === ВСПОМОГАТЕЛЬНЫЙ КОМПОНЕНТ ДЛЯ ГРАМОТНОЙ РАМКИ (DRY) ===
function WaveBorder({ color, children, extraDecorations }: { color: string; children: ReactNode; extraDecorations?: ReactNode }) {
  return (
    <div className="relative rounded-xl">
      {/* Волна и пульсация */}
      <div className="absolute -inset-[3px] rounded-xl z-0">
        <div
          className="absolute inset-0 rounded-xl animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, transparent 65%, ${color}60 85%, ${color} 100%)`,
            filter: 'blur(1.5px)',
          }}
        />
        <div 
          className="absolute inset-0 rounded-xl animate-pulse"
          style={{ boxShadow: `0 0 20px 4px ${color}30` }}
        />
      </div>
      {/* Маска центра */}
      <div className="absolute inset-0 rounded-xl border-[3px] border-[#171717] z-10 pointer-events-none" />
      
      {/* Контент */}
      <div className="relative z-20 rounded-xl overflow-hidden bg-[#171717]">
        {children}
        {extraDecorations}
      </div>
    </div>
  );
}

// === ОБНОВЛЕННЫЕ ЭФФЕКТЫ УРОВНЕЙ (Fallback) ===
function Level67Effect({ user, children }: { user: any; children: ReactNode }) {
  return <WaveBorder color={user.role?.color || "#8b5cf6"}>{children}</WaveBorder>;
}

function Level8Effect({ user, children }: { user: any; children: ReactNode }) {
  return <WaveBorder color={user.role?.color || "#f59e0b"}>{children}</WaveBorder>;
}

function Level9Effect({ children }: { children: ReactNode }) {
  return (
    <WaveBorder 
      color="#3b82f6" 
      extraDecorations={
        <>
          <span className="absolute top-1 right-1 text-[10px] font-mono text-blue-400 animate-float-1">&lt;/&gt;</span>
          <span className="absolute bottom-1 left-1 text-[10px] font-mono text-blue-300 animate-float-2">{`{ }`}</span>
        </>
      }
    >
      {children}
    </WaveBorder>
  );
}

function Level10Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-xl">
      <WaveBorder color="#ffffff">
        {children}
      </WaveBorder>
      {/* Hello Kitty вынесен наружу, чтобы позиционироваться относительно всей рамки, как в оригинале */}
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow pointer-events-none select-none z-30">
        <img src="/hello-kitty.png" alt="VIP" className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]" draggable={false} />
      </div>
    </div>
  );
}

function Level11Effect({ children }: { children: ReactNode }) {
  return (
    <div className="relative rounded-xl">
      <div className="absolute -inset-[3px] rounded-xl z-0">
        {/* Обратное вращение для уникальности 11 уровня */}
        <div
          className="absolute inset-0 rounded-xl animate-spin-reverse"
          style={{
            background: `conic-gradient(from 0deg, transparent 0%, transparent 65%, #10b98160 85%, #10b981 100%)`,
            filter: 'blur(1.5px)',
          }}
        />
        <div 
          className="absolute inset-0 rounded-xl animate-pulse"
          style={{ boxShadow: `0 0 20px 4px #10b98130` }}
        />
      </div>
      <div className="absolute inset-0 rounded-xl border-[3px] border-[#171717] z-10 pointer-events-none" />
      <div className="relative z-20 rounded-xl overflow-hidden bg-[#171717]">
        {children}
        <span className="absolute top-1 right-1 text-[8px] font-mono text-green-400 animate-float-1">01</span>
        <span className="absolute bottom-1 left-1 text-[8px] font-mono text-green-300 animate-float-2">10</span>
      </div>
    </div>
  );
}