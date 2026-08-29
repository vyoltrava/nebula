"use client";

/**
 * Заглушка «Недоступно в режиме Nebula» — для страниц соцсети
 * (профили, посты), когда включён режим чистого мессенджера.
 */
import { useRouter } from "next/navigation";
import { Sparkles, MessagesSquare } from "lucide-react";

export function NebulaBlocked() {
  const router = useRouter();
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 dark:bg-[#17171b] px-4">
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />
      <div className="max-w-sm w-full rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-purple-500/15 flex items-center justify-center mb-4">
          <Sparkles size={26} className="text-purple-500" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          Недоступно в режиме Nebula
        </h1>
        <p className="text-sm text-gray-400 dark:text-white/30 mb-6">
          Этот раздел соцсети скрыт, пока активен режим чистого мессенджера.
        </p>
        <button
          onClick={() => router.push("/messages")}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-3 transition-colors"
        >
          <MessagesSquare size={16} />
          К чатам
        </button>
      </div>
    </div>
  );
}