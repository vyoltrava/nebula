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

  // Уровень 8 (спецотдел): вращающееся кольцо с градиентом
  if (level === 8) {
    const color = user.role?.color || "#f59e0b";
    return (
      <div className="relative">
        <div
          className="absolute -inset-[4px] rounded-full animate-spin-slow"
          style={{
            background: `conic-gradient(from 0deg, ${color}, ${color}80, transparent, ${color}80, ${color})`,
            filter: `drop-shadow(0 0 8px ${color}80)`,
          }}
        />
        <div className="relative rounded-full border-[3px] border-[#171717]">
          {children}
        </div>
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
        {/* Hello Kitty мордочка сверху */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center animate-bounce-slow">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_2px_8px_rgba(255,255,255,0.8)]">
            {/* Голова */}
            <ellipse cx="50" cy="55" rx="45" ry="40" fill="white" stroke="#000" strokeWidth="2"/>
            {/* Уши */}
            <path d="M 20 25 L 10 5 L 30 15 Z" fill="white" stroke="#000" strokeWidth="2"/>
            <path d="M 80 25 L 90 5 L 70 15 Z" fill="white" stroke="#000" strokeWidth="2"/>
            {/* Бант */}
            <ellipse cx="75" cy="20" rx="12" ry="8" fill="#ff1744" stroke="#000" strokeWidth="1.5"/>
            <circle cx="75" cy="20" r="3" fill="#ffeb3b"/>
            {/* Глаза */}
            <ellipse cx="35" cy="50" rx="4" ry="5" fill="#000"/>
            <ellipse cx="65" cy="50" rx="4" ry="5" fill="#000"/>
            {/* Нос */}
            <ellipse cx="50" cy="60" rx="3" ry="2.5" fill="#ffeb3b"/>
            {/* Усы */}
            <line x1="15" y1="58" x2="35" y2="62" stroke="#000" strokeWidth="1.5"/>
            <line x1="15" y1="65" x2="35" y2="65" stroke="#000" strokeWidth="1.5"/>
            <line x1="65" y1="62" x2="85" y2="58" stroke="#000" strokeWidth="1.5"/>
            <line x1="65" y1="65" x2="85" y2="65" stroke="#000" strokeWidth="1.5"/>
          </svg>
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