"use client";
// 🤖 BOT Company переехала в чат с Bot_creator.
// Пользовательские боты создаются в личке с @bot_creator (кнопки над вводом),
// а сами боты — это Python-файлы с API-ключом. Системные боты — отдельная каста.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BotsPageRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/messages"); }, [router]);
  return (
    <div className="h-screen flex items-center justify-center bg-ivory dark:bg-[#18181b]">
      <p className="text-gray-500 dark:text-white/40 text-sm">
        Управление ботами переехало в чат с Bot_creator 🤖 — переносим…
      </p>
    </div>
  );
}