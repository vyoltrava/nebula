"use client";

import { useMemo, useEffect, useRef } from "react";
import { Recommendation } from "@/app/recommendations/[userId]/page";
import { Avatar } from "@/components/Avatar";

type CenterUser = { id: number; display_name: string; avatar_url?: string | null };

export function RecommendationGraph({
  centerUser,
  recommendations,
  onCardClick,
}: {
  centerUser: CenterUser;
  recommendations: Recommendation[];
  onCardClick?: (rec: Recommendation) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(() => {
    const count = recommendations.length;
    const radius = 260;
    const pts: { x: number; y: number; score: number }[] = [];
    if (count === 0) return pts;

    const sorted = [...recommendations].sort(
      (p, c) => (c.similarity.similarity_score || 0) - (p.similarity.similarity_score || 0)
    );

    const rings = Math.min(3, Math.max(1, Math.ceil(count / 4)));
    const perRing = 8;
    let idx = 0;
    for (let ring = 1; ring <= rings; ring++) {
      const rRadius = (radius / rings) * ring;
      const nodesInRing = Math.min(perRing * ring, sorted.length - idx);
      if (nodesInRing <= 0) break;
      for (let i = 0; i < nodesInRing; i++) {
        const angle = (i / nodesInRing) * 2 * Math.PI - Math.PI / 2;
        const spread = rRadius + (Math.random() - 0.5) * 40;
        pts.push({
          x: Math.cos(angle) * spread,
          y: Math.sin(angle) * spread,
          score: sorted[idx]?.similarity.similarity_score || 0,
        });
        idx++;
        if (idx >= sorted.length) break;
      }
      if (idx >= sorted.length) break;
    }
    return pts;
  }, [recommendations]);

  useEffect(() => {
    if (!containerRef.current) return;
    const cards = containerRef.current.querySelectorAll(".rec-card");
    cards.forEach((c, i) => {
      (c as HTMLElement).style.transitionDelay = `${i * 60}ms`;
    });
  }, [positions]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Центральный узел */}
      <div
        className="absolute z-20 flex flex-col items-center animate-[pulse_2s_ease-in-out_infinite] rounded-full"
        style={{ transform: "translate(0, 0)", width: 90, height: 90, animationDuration: "3s" }}
      >
        <div className="relative">
          <Avatar src={centerUser.avatar_url} name={centerUser.display_name || "?"} size={80} />
          <div className="absolute -bottom-1 -right-1 bg-[#8b5cf6] text-white text-[10px] px-1.5 py-0.5 rounded-full shadow">
            ТЫ
          </div>
        </div>
        <span className="mt-2 font-bold text-sm text-gray-900 dark:text-white max-w-[140px] text-center truncate">
          {centerUser.display_name || "—"}
        </span>
      </div>

      {/* Паутиночные линии к центру */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
        {positions.map((p, i) => (
          <line
            key={i}
            x1="50%"
            y1="50%"
            x2={`calc(50% + ${p.x}px)`}
            y2={`calc(50% + ${p.y}px)`}
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-gray-300 dark:text-white/10"
          />
        ))}
      </svg>

      {/* Карточки */}
      {recommendations.map((rec, i) => {
        const pos = positions[i];
        if (!pos) return null;
        return (
          <div
            key={rec.user.id}
            onClick={() => onCardClick?.(rec)}
            className="rec-card absolute z-10 cursor-pointer group opacity-0 translate-y-2 transition-all duration-300 will-change-transform"
            style={{
              left: `calc(50% + ${pos.x}px - 60px)`,
              top: `calc(50% + ${pos.y}px - 70px)`,
              width: 120,
            }}
          >
            <div className="relative rounded-xl bg-gray-50 dark:bg-[#1a1a1e] border border-line dark:border-white/10 p-2 shadow-lg transition-transform group-hover:scale-105 group-hover:-translate-y-1">
              <div className="relative flex justify-center">
                <Avatar src={rec.user.avatar_url} name={rec.user.display_name || rec.user.username} size={40} />
                <span className="absolute -bottom-1 -right-1 text-xs font-bold bg-[#8b5cf6] text-white px-1 rounded-full">
                  {Math.round(rec.similarity.similarity_score || 0)}%
                </span>
              </div>
              <p className="text-center text-xs font-medium text-gray-900 dark:text-white/80 truncate mt-1">
                {rec.user.display_name}
              </p>
            </div>
          </div>
        );
      })}

      {/* заставка opacity-100 для анимации */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none" />
    </div>
  );
}

// заставляем карточки анимироваться после монтирования
export {} // <-- type-only noop; реальная анимация через CSS animation-delay в эффекте выше

