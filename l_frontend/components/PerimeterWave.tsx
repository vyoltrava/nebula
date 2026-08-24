"use client";

import { ReactNode } from "react";

interface PerimeterWaveProps {
  children: ReactNode;
  color: string; // Цвет свечения (например, "#8b5cf6")
  speed?: "slow" | "normal" | "fast";
  extraDecorations?: ReactNode; // Доп. элементы (например, значки уровня 9/11)
}

export function PerimeterWave({
  children,
  color,
  speed = "normal",
  extraDecorations,
}: PerimeterWaveProps) {
  // Длительность анимации в зависимости от пропса speed
  const duration = speed === "slow" ? "8s" : speed === "fast" ? "2.5s" : "4s";

  return (
    <div className="relative inline-block rounded-xl">
      {/* 1. Внешнее размытое свечение (Glow) */}
      <div
        className="absolute -inset-0.5 rounded-xl opacity-60 blur-md"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, ${color} 50%, transparent 100%)`,
          animation: `spin ${duration} linear infinite`,
        }}
      />

      {/* 2. Чёткое кольцо обводки (Sharp Perimeter) */}
      <div
        className="absolute -inset-0.5 rounded-xl"
        style={{
          background: `conic-gradient(from 0deg, transparent 0%, ${color} 40%, ${color} 60%, transparent 100%)`,
          animation: `spin ${duration} linear infinite`,
        }}
      />

      {/* 3. Дополнительные декорации (уровень 9/11) */}
      {/* z-20 гарантирует, что они будут поверх аватарки, но pointer-events-none не мешает кликам */}
      {extraDecorations && (
        <div className="absolute inset-0 z-20 pointer-events-none rounded-xl overflow-hidden">
          {extraDecorations}
        </div>
      )}

      {/* 4. Внутренний контейнер для аватарки */}
      {/* bg-[#101010] и p-[2px] создают "маску", чтобы градиент был виден только по краям */}
      <div className="relative z-10 rounded-xl bg-[#101010] p-[2px]">
        <div className="rounded-[10px] overflow-hidden w-full h-full">
          {children}
        </div>
      </div>

      {/* Локальная анимация вращения (на случай, если в tailwind.config нет кастомных keyframes) */}
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}