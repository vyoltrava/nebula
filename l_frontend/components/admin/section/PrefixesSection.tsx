"use client";
// 🏷️ ПРЕФИКСЫ (adminnew): подвкладки «Каналы» (существующие плашки каналов)
// и «Пользователи» (создание многоугольных иконок-префиксов для юзеров).
import { useState } from "react";
import { ChannelBadgesSection } from "./ChannelBadgesSection";
import { UserPrefixesSection } from "./UserPrefixesSection";
import { Megaphone, Users } from "lucide-react";

export function PrefixesSection({ me }: { me: any }) {
  const [sub, setSub] = useState<"channels" | "users">("channels");

  return (
    <div>
      {/* Подвкладки */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSub("channels")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            sub === "channels"
              ? "bg-[#a855f7] text-gray-900 dark:text-white border-transparent"
              : "bg-white dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
          }`}
        >
          <Megaphone size={16} /> Каналы
        </button>
        <button
          onClick={() => setSub("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
            sub === "users"
              ? "bg-[#a855f7] text-gray-900 dark:text-white border-transparent"
              : "bg-white dark:bg-white/5 border-line dark:border-white/10 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10"
          }`}
        >
          <Users size={16} /> Пользователи
        </button>
      </div>

      {sub === "channels" ? <ChannelBadgesSection me={me} /> : <UserPrefixesSection me={me} />}
    </div>
  );
}
