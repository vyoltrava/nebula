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

// === ВСПОМОГАТЕЛЬНЫЙ КОМПОНЕНТ: ВОЛНА ПО КОНТУРУ (SVG) ===
function PerimeterWave({ color, speed = "normal", children, extraDecorations }: { 
  color: string; 
  speed?: "normal" | "slow";
  children: ReactNode; 
  extraDecorations?: ReactNode; 
}) {
  return (
    <div className="relative inline-block">
      {/* SVG-волна строго по контуру скругленного квадрата */}
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

      {/* Контейнер аватарки с темным фоном и скруглением */}
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

  // 1. Сначала ищем кастомный бейдж
  const customBadge = user.custom_badge_url ? {
    id: -1,
    icon_url: user.custom_badge_url,
    glow_color: "#8b5cf6",
    enable_ring: true,
    enable_glow: true,
    name: "Custom Badge"
  } : null;

  // 2. Ищем бейдж в доступных
  let userBadge = customBadge || 
                  availableBadges.find((b: any) => b.id === user.selected_badge_id) || 
                  availableBadges.find((b: any) => b.user_id === user.id) ||
                  availableBadges.find((b: any) => b.role_id === user.role?.id);

  // 3. ОПТИМИЗАЦИЯ: Если бейджа нет в списке, но у нас есть fallback-уровень со своим бейджем (например, Founder/Level 10),
  // мы создаем виртуальный объект бейджа здесь, чтобы логика отрисовки ниже сработала единообразно.
  if (!userBadge) {
     // Пример для Level 10 (Founder/VIP)
     if (level === 10) {
         userBadge = {
             id: 999, // виртуальный ID
             icon_url: "/hello-kitty.png", // путь к иконке фаундера
             glow_color: "#ffffff",
             enable_ring: true,
             enable_glow: true,
             name: "Founder"
         };
     }
     // Можно добавить другие уровни, если у них есть иконки
  }

  // Определяем цвет свечения
  const glowColor = userBadge?.glow_color || user.role?.color || "#8b5cf6";
  
  // Флаг, нужно ли рисовать кольцо
  const showRing = userBadge?.enable_ring || (level >= 6 && level <= 9) || level === 11;

  return (
    <div className="relative inline-block">
      
      {/* === РЕНДЕРИНГ ЭФФЕКТОВ И АВATARКИ === */}
      
      {/* Вариант А: Есть активный бейдж с кольцом или высокий уровень */}
      {showRing && (
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
      )}

      {/* Вариант Б: Нет кольца, просто аватарка (низкие уровни) */}
      {!showRing && (
        <div className="relative z-10 rounded-xl overflow-hidden bg-[#171717] border-[2px] border-[#171717]">
          {children}
        </div>
      )}

      {/* === ЕДИНЫЙ БЛОК ОТРИСОВКИ ЗНАЧКА (ВСЕГДА В ЛЕВОМ ВЕРХНЕМ УГЛУ) === */}
      {userBadge && (
        <div 
          className="absolute z-30 select-none"
          style={{ top: '-12px', left: '-12px' }} 
        >
          <div 
            className={`w-9 h-9 rounded-full bg-[#171717] border-2 border-[#171717] flex items-center justify-center shadow-lg ${
              canEditBadge ? 'pointer-events-auto cursor-pointer hover:scale-110 transition-transform' : 'pointer-events-none'
            }`}
            onClick={canEditBadge ? onBadgeClick : undefined}
            title={canEditBadge ? "Нажми, чтобы сменить значок" : userBadge.name}
          >
            {/* Свечение под значком */}
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
            
            {/* Иконка значка */}
            <img
              src={userBadge.icon_url}
              alt={userBadge.name || "Badge"}
              className="w-6 h-6 object-contain"
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// === УПРОЩЕННЫЕ FALLBACK КОМПОНЕНТЫ (ТЕПЕРЬ ОНИ НЕ РИСУЮТ ЗНАЧКИ) ===
// Они нужны только если вы хотите использовать их отдельно, но в текущей логике 
// AvatarFrame сам решает, что рисовать. Можно оставить пустыми или удалить, 
// так как логика перенесена внутрь AvatarFrame.

function Level67Effect({ user, children }: { user: any; children: ReactNode }) {
  // Теперь этот компонент может быть просто оберткой, если он используется где-то еще
  // Но в рамках AvatarFrame выше, логика уже включена.
  return <>{children}</>; 
}

function Level8Effect({ user, children }: { user: any; children: ReactNode }) {
  return <>{children}</>;
}

function Level9Effect({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function Level10Effect({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function Level11Effect({ children }: { children: ReactNode }) {
  return <>{children}</>;
}