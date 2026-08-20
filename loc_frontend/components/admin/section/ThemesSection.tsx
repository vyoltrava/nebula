"use client";
import { Palette, Wrench } from "lucide-react";

export function ThemesSection({ me }: { me: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 border border-white/10 rounded-xl bg-white/5">
      <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
        <Wrench size={32} className="text-purple-400" />
      </div>
      <h2 className="text-xl font-black text-white mb-2">Технические работы</h2>
      <p className="text-white/50 text-sm text-center max-w-md">
        Конструктор тем находится в разработке. Скоро здесь можно будет создавать анимированные фоны для сообщества.
      </p>
    </div>
  );
}