"use client";
import { Video,
} from "lucide-react";
// ==========================================
// 🦴 Скелетон для поста в закладках/профиле (сложный)
// ==========================================
export function PostSkeleton() {
  return (
    <article className="p-4 border-b border-white/10 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-white/10 rounded w-32" />
            <div className="h-3 bg-white/5 rounded w-20" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-white/10 rounded w-full" />
            <div className="h-3 bg-white/10 rounded w-4/5" />
            <div className="h-3 bg-white/10 rounded w-3/5" />
          </div>
          <div className="flex gap-3 pt-2">
            <div className="h-7 bg-white/10 rounded-full w-16" />
            <div className="h-7 bg-white/10 rounded-full w-20" />
            <div className="h-7 bg-white/10 rounded-full w-24" />
          </div>
        </div>
      </div>
    </article>
  );
}

// ==========================================
// 🦴 Скелетон для главного поста (на странице /post/[id])
// ==========================================
export function MainPostSkeleton() {
  return (
    <div className="p-4 border-b border-white/10 animate-pulse">
      <div className="flex gap-3">
        {/* Аватарка */}
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/10 shrink-0" />
        
        <div className="flex-1 space-y-3">
          {/* Имя и юзернейм */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-32 bg-white/10 rounded-md" />
            <div className="h-3 w-24 bg-white/5 rounded-md" />
          </div>
          
          {/* Текст поста */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-white/10 rounded-md" />
            <div className="h-4 w-4/5 bg-white/10 rounded-md" />
          </div>
          
          {/* Заглушка под медиа (картинку/видео) */}
          <div className="h-48 w-full bg-white/5 rounded-xl" />
          
          {/* Кнопки действий (лайк, ответ и т.д.) */}
          <div className="flex gap-4 pt-2">
            <div className="h-8 w-16 bg-white/10 rounded-full" />
            <div className="h-8 w-16 bg-white/10 rounded-full" />
            <div className="h-8 w-16 bg-white/10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse border-b border-white/10">
      <div className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
          {/* Аватарка */}
          <div className="flex justify-center md:justify-start">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-white/10" />
          </div>

          {/* Контент */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Имя и бейджи */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0 text-center md:text-left space-y-2">
                <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                  <div className="h-6 bg-white/10 rounded w-40" />
                  <div className="h-4 bg-purple-500/20 rounded w-16" />
                </div>
                <div className="h-3 bg-white/10 rounded w-24 mx-auto md:mx-0" />
                {/* Bio */}
                <div className="space-y-1.5 pt-1">
                  <div className="h-3 bg-white/5 rounded w-full" />
                  <div className="h-3 bg-white/5 rounded w-4/5" />
                </div>
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-2 shrink-0 w-full md:w-auto justify-center md:justify-end">
                <div className="h-9 bg-purple-500/20 rounded-full w-24" />
                <div className="h-9 bg-white/10 rounded-full w-28" />
                <div className="h-9 bg-emerald-500/10 rounded-full w-32 hidden sm:block" />
              </div>
            </div>

            {/* Статистика */}
            <div className="flex gap-4 md:gap-6 pt-2 justify-center md:justify-start">
              <div className="space-y-1">
                <div className="h-4 bg-white/10 rounded w-10" />
                <div className="h-3 bg-white/5 rounded w-16" />
              </div>
              <div className="space-y-1">
                <div className="h-4 bg-white/10 rounded w-10" />
                <div className="h-3 bg-white/5 rounded w-20" />
              </div>
              <div className="space-y-1">
                <div className="h-4 bg-white/10 rounded w-10" />
                <div className="h-3 bg-white/5 rounded w-14" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BookmarkPageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Заголовок страницы */}
      <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20" />
          <div className="h-6 bg-white/10 rounded w-32" />
        </div>
      </div>

      {/* Посты-закладки */}
      <PostSkeleton />
      <PostSkeleton />
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}

// ==========================================
// 🦴 Скелетон для списка чатов (страница /messages)
// ==========================================
export function ChatListSkeleton() {
  return (
    <div className="space-y-1 p-2 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl">
          {/* Аватарка */}
          <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2">
            {/* Имя и время */}
            <div className="flex justify-between">
              <div className="h-4 w-32 bg-white/10 rounded-md" />
              <div className="h-3 w-12 bg-white/5 rounded-md" />
            </div>
            {/* Последнее сообщение */}
            <div className="h-3 w-48 bg-white/5 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 🦴 Скелетон для окна чата (активная переписка)
// ==========================================
export function ChatWindowSkeleton() {
  return (
    <div className="flex-1 flex flex-col bg-[#171717] animate-pulse">
      {/* Шапка чата */}
      <div className="h-16 border-b border-white/10 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-white/10 rounded-md" />
          <div className="h-3 w-20 bg-white/5 rounded-md" />
        </div>
      </div>

      {/* Область сообщений */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Входящее сообщение */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 shrink-0 mt-1" />
          <div className="space-y-2 max-w-[75%]">
            <div className="h-3 w-24 bg-white/5 rounded-md" />
            <div className="h-12 w-56 bg-white/10 rounded-2xl rounded-tl-sm" />
          </div>
        </div>

        {/* Исходящее сообщение */}
        <div className="flex gap-3 justify-end">
          <div className="space-y-2 max-w-[75%]">
            <div className="h-10 w-72 bg-[#8b5cf6]/20 rounded-2xl rounded-tr-sm" />
            <div className="h-3 w-16 bg-white/5 rounded-md ml-auto" />
          </div>
        </div>

        {/* Входящее сообщение 2 */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/10 shrink-0 mt-1" />
          <div className="space-y-2 max-w-[60%]">
            <div className="h-3 w-20 bg-white/5 rounded-md" />
            <div className="h-8 w-32 bg-white/10 rounded-2xl rounded-tl-sm" />
          </div>
        </div>
      </div>

      {/* Поле ввода */}
      <div className="p-4 border-t border-white/10">
        <div className="h-10 w-full bg-white/5 rounded-xl" />
      </div>
    </div>
  );
}


// 🦴 ===== УНИВЕРСАЛЬНЫЕ СКЕЛЕТОНЫ МЕДИА =====
export function Shimmer() {
  return <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />;
}

// Скелет видео-квадрата в чате (ложится поверх, absolute)
export function VideoNoteSkeleton() {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white/5 border border-white/10">
      <Shimmer />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="w-11 h-11 rounded-xl bg-white/10 animate-pulse flex items-center justify-center">
          <Video size={18} className="text-[#a78bfa]" />
        </div>
        <span className="text-[10px] font-medium text-white/30">Загрузка видео…</span>
      </div>
    </div>
  );
}

// Скелет баннера
export function BannerSkeleton({ className = "h-40 sm:h-52 rounded-2xl" }: { className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-white/5 ${className}`}>
      <Shimmer />
    </div>
  );
}

// Скелет аватарки
export function AvatarSkeleton({ size = 96 }: { size?: number }) {
  return (
    <div className="relative rounded-xl bg-white/5 overflow-hidden" style={{ width: size, height: size }}>
      <Shimmer />
    </div>
  );
}