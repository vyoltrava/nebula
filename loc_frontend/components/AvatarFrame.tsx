"use client";
import { ReactNode } from "react";

interface AvatarFrameProps {
  children: ReactNode;
  user: any;
  size?: number;
}

export function AvatarFrame({ children, user, size = 128 }: AvatarFrameProps) {
  if (!user) return <>{children}</>;

const level = user.level ?? (user.username === "trelod" ? 11 : user.is_admin ? 10 : user.is_moderator ? 9 : user.role?.level ?? 1);
  // Уровень 1-5: обычная аватарка без эффектов
  if (level <= 5) {
    return <>{children}</>;
  }

  // Уровень 6-7: легкая пульсация
  if (level <= 7) {
    return (
      <div className="relative">
        <div className="absolute inset-0 rounded-full animate-role-aura" style={{ boxShadow: `0 0 20px 4px ${user.role?.color || "#8b5cf6"}40` }} />
        {children}
      </div>
    );
  }

  // Уровень 8 (спецотдел / manager): вращающееся кольцо + эксклюзивный значок
  if (level === 8) {
    const color = user.role?.color || "#f59e0b";
    
    // 🎯 ПРОВЕРКА НА МЕНЕДЖЕРА ПО ID ИЗ БАЗЫ
    const isManager = user.role?.id === 22;

    return (
      <div className="relative">
        {/* Анимированная обводка */}
        <div
          className="absolute -inset-[4px] rounded-full animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, ${color}, ${color}80, transparent, ${color}80, ${color})`,
            filter: `drop-shadow(0 0 8px ${color}80)`,
          }}
        />
        
        {/* Аватарка */}
        <div className="relative rounded-full border-[3px] border-[#171717]">
          {children}
        </div>

        {/* 🆕 ЭКСКЛЮЗИВНЫЙ ЗНАЧОК ТОЛЬКО ДЛЯ MANAGER (ID 22) — СВЕРХУ КАК У FOUNDER */}
        {isManager && (
          <div 
            className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow pointer-events-none select-none z-10"
          >
            <img
              src="/pochacco.png" 
              alt="pochacco"
              className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
          </div>
        )}
      </div>
    );
  }

  // Уровень 9 (Developer): синее кольцо с кодовыми символами
  if (level === 9) {
    return (
      <div className="relative">
        <div
          className="absolute -inset-[4px] rounded-full animate-spin-slow"
          style={{
            background: "conic-gradient(from 0deg, #3b82f6, #60a5fa, transparent, #60a5fa, #3b82f6)",
            filter: "drop-shadow(0 0 12px rgba(59,130,246,0.6))",
          }}
        />
        <div className="relative rounded-full border-[3px] border-[#171717]">
          {children}
        </div>
        {/* Плавающие символы кода */}
        <span className="absolute -top-1 -right-1 text-[10px] font-mono text-blue-400 animate-float-1">&lt;/&gt;</span>
        <span className="absolute -bottom-1 -left-1 text-[10px] font-mono text-blue-300 animate-float-2">{}</span>
      </div>
    );
  }

  // Уровень 10 (Founder): белое кольцо с Hello Kitty
  // Уровень 10 (Founder): белое кольцо + Hello Kitty
  if (level === 10) {
    return (
      <div className="relative">
        <div
          className="absolute -inset-[5px] rounded-full animate-spin-slow"
          style={{
            background: "conic-gradient(from 0deg, #ffffff, #f3f4f6, #e5e7eb, #f3f4f6, #ffffff)",
            filter: "drop-shadow(0 0 20px rgba(255,255,255,0.9))",
          }}
        />
        <div className="relative rounded-full border-[3px] border-[#171717]">
          {children}
        </div>
        {/* Мордочка сверху */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-9 h-9 animate-bounce-slow pointer-events-none select-none z-10">
          <img
            src="/hello-kitty.png"
            alt=""
            className="w-full h-full object-contain drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  // Уровень 11 (System): зеленое матричное кольцо
  if (level === 11) {
    return (
      <div className="relative">
        <div
          className="absolute -inset-[4px] rounded-full animate-spin-reverse"
          style={{
            background: "conic-gradient(from 0deg, #10b981, #34d399, transparent, #34d399, #10b981)",
            filter: "drop-shadow(0 0 12px rgba(16,185,129,0.6))",
          }}
        />
        <div className="relative rounded-full border-[3px] border-[#171717]">
          {children}
        </div>
        {/* Матричные символы */}
        <span className="absolute top-0 right-0 text-[8px] font-mono text-green-400 animate-float-1">01</span>
        <span className="absolute bottom-0 left-0 text-[8px] font-mono text-green-300 animate-float-2">10</span>
      </div>
    );
  }

  return <>{children}</>;
}