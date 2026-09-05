"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Video,
} from "lucide-react";
// ==========================================
// 🦴 Скелетон для поста в закладках/профиле (сложный)
// ==========================================
export function PostSkeleton() {
  return (
    <article className="p-4 border-b border-line dark:border-white/10 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-32" />
            <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-20" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 bg-gray-100 dark:bg-white/10 rounded w-full" />
            <div className="h-3 bg-gray-100 dark:bg-white/10 rounded w-4/5" />
            <div className="h-3 bg-gray-100 dark:bg-white/10 rounded w-3/5" />
          </div>
          <div className="flex gap-3 pt-2">
            <div className="h-7 bg-gray-100 dark:bg-white/10 rounded-full w-16" />
            <div className="h-7 bg-gray-100 dark:bg-white/10 rounded-full w-20" />
            <div className="h-7 bg-gray-100 dark:bg-white/10 rounded-full w-24" />
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
    <div className="p-4 border-b border-line dark:border-white/10 animate-pulse">
      <div className="flex gap-3">
        {/* Аватарка */}
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
        
        <div className="flex-1 space-y-3">
          {/* Имя и юзернейм */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-32 bg-gray-100 dark:bg-white/10 rounded-md" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-white/5 rounded-md" />
          </div>
          
          {/* Текст поста */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-100 dark:bg-white/10 rounded-md" />
            <div className="h-4 w-4/5 bg-gray-100 dark:bg-white/10 rounded-md" />
          </div>
          
          {/* Заглушка под медиа (картинку/видео) */}
          <div className="h-48 w-full bg-gray-100 dark:bg-white/5 rounded-xl" />
          
          {/* Кнопки действий (лайк, ответ и т.д.) */}
          <div className="flex gap-4 pt-2">
            <div className="h-8 w-16 bg-gray-100 dark:bg-white/10 rounded-full" />
            <div className="h-8 w-16 bg-gray-100 dark:bg-white/10 rounded-full" />
            <div className="h-8 w-16 bg-gray-100 dark:bg-white/10 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse border-b border-line dark:border-white/10">
      <div className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
          {/* Аватарка */}
          <div className="flex justify-center md:justify-start">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-gray-100 dark:bg-white/10" />
          </div>

          {/* Контент */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Имя и бейджи */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0 text-center md:text-left space-y-2">
                <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
                  <div className="h-6 bg-gray-100 dark:bg-white/10 rounded w-40" />
                  <div className="h-4 bg-purple-500/20 rounded w-16" />
                </div>
                <div className="h-3 bg-gray-100 dark:bg-white/10 rounded w-24 mx-auto md:mx-0" />
                {/* Bio */}
                <div className="space-y-1.5 pt-1">
                  <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-full" />
                  <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-4/5" />
                </div>
              </div>

              {/* Кнопки действий */}
              <div className="flex gap-2 shrink-0 w-full md:w-auto justify-center md:justify-end">
                <div className="h-9 bg-purple-500/20 rounded-full w-24" />
                <div className="h-9 bg-gray-100 dark:bg-white/10 rounded-full w-28" />
                <div className="h-9 bg-emerald-500/10 rounded-full w-32 hidden sm:block" />
              </div>
            </div>

            {/* Статистика */}
            <div className="flex gap-4 md:gap-6 pt-2 justify-center md:justify-start">
              <div className="space-y-1">
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-10" />
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-16" />
              </div>
              <div className="space-y-1">
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-10" />
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-20" />
              </div>
              <div className="space-y-1">
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-10" />
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-14" />
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
      <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20" />
          <div className="h-6 bg-gray-100 dark:bg-white/10 rounded w-32" />
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
          {/* Аватарка (квадратная rounded-xl, как <Avatar> в реальном списке чатов) */}
          <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2">
            {/* Имя и время */}
            <div className="flex justify-between">
              <div className="h-4 w-32 bg-gray-100 dark:bg-white/10 rounded-md" />
              <div className="h-3 w-12 bg-gray-100 dark:bg-white/5 rounded-md" />
            </div>
            {/* Последнее сообщение */}
            <div className="h-3 w-48 bg-gray-100 dark:bg-white/5 rounded-md" />
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
    <div className="flex-1 flex flex-col bg-paper dark:bg-[#171717] animate-pulse">
      {/* Шапка чата */}
      <div className="h-16 border-b border-line dark:border-white/10 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-gray-100 dark:bg-white/10 rounded-md" />
          <div className="h-3 w-20 bg-gray-100 dark:bg-white/5 rounded-md" />
        </div>
      </div>

      {/* Область сообщений */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Входящее сообщение */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0 mt-1" />
          <div className="space-y-2 max-w-[75%]">
            <div className="h-3 w-24 bg-gray-100 dark:bg-white/5 rounded-md" />
            <div className="h-12 w-56 bg-gray-100 dark:bg-white/10 rounded-2xl rounded-tl-sm" />
          </div>
        </div>

        {/* Исходящее сообщение */}
        <div className="flex gap-3 justify-end">
          <div className="space-y-2 max-w-[75%]">
            <div className="h-10 w-72 bg-[#8b5cf6]/20 rounded-2xl rounded-tr-sm" />
            <div className="h-3 w-16 bg-gray-100 dark:bg-white/5 rounded-md ml-auto" />
          </div>
        </div>

        {/* Входящее сообщение 2 */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0 mt-1" />
          <div className="space-y-2 max-w-[60%]">
            <div className="h-3 w-20 bg-gray-100 dark:bg-white/5 rounded-md" />
            <div className="h-8 w-32 bg-gray-100 dark:bg-white/10 rounded-2xl rounded-tl-sm" />
          </div>
        </div>
      </div>

      {/* Поле ввода */}
      <div className="p-4 border-t border-line dark:border-white/10">
        <div className="h-10 w-full bg-gray-100 dark:bg-white/5 rounded-xl" />
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
    <div className="absolute inset-0 overflow-hidden rounded-2xl bg-white/5 border border-line dark:border-white/10">
      <Shimmer />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
        <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/10 animate-pulse flex items-center justify-center">
          <Video size={18} className="text-[#a78bfa]" />
        </div>
        <span className="text-[10px] font-medium text-gray-500 dark:text-white/30">Загрузка видео…</span>
      </div>
    </div>
  );
}

// Скелет баннера
export function BannerSkeleton({ className = "h-40 sm:h-52 rounded-2xl" }: { className?: string }) {
  return (
    <div className={`relative w-full overflow-hidden bg-gray-100 dark:bg-white/5 ${className}`}>
      <Shimmer />
    </div>
  );
}

// Скелет аватарки
export function AvatarSkeleton({ size = 96 }: { size?: number }) {
  return (
    <div className="relative rounded-xl bg-gray-100 dark:bg-white/5 overflow-hidden" style={{ width: size, height: size }}>
      <Shimmer />
    </div>
  );
}

// ==========================================
// 🦴 Скелетон карточки участника (страница /team)
// ==========================================
export function TeamMemberSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 animate-pulse">
      <div className={`w-14 h-14 ${round ? "rounded-full" : "rounded-xl"} bg-gray-100 dark:bg-white/10 shrink-0`} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-32" />
        <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-20" />
        <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-16" />
      </div>
    </div>
  );
}

// ==========================================
// 🦴 Скелетон строки пользователя (поиск людей, списки юзеров)
// ==========================================
export function UserRowSkeleton({ round = false }: { round?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-2.5 animate-pulse">
      <div className={`w-11 h-11 ${round ? "rounded-full" : "rounded-xl"} bg-gray-100 dark:bg-white/10 shrink-0`} />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-28" />
        <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-20" />
      </div>
    </div>
  );
}

// ==========================================
// 🦴 Скелетон результатов поиска (страница /search)
// ==========================================
export function SearchResultsSkeleton() {
  return (
    <div>
      <div className="p-4 border-b border-line dark:border-white/10">
        <div className="h-4 bg-purple-500/20 rounded w-24 mb-3 animate-pulse" />
        <UserRowSkeleton />
        <UserRowSkeleton />
        <UserRowSkeleton />
        <UserRowSkeleton />
      </div>
      <PostSkeleton />
      <PostSkeleton />
    </div>
  );
}

// ==========================================
// 🦴 Скелетон списка уведомлений (страница /notifications)
// ==========================================
export function NotificationsSkeleton() {
  return (
    <div className="divide-y divide-line dark:divide-white/5 animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-start gap-3 p-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-32" />
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-24" />
            </div>
            <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-40" />
          </div>
          <div className="w-2 h-2 rounded-full bg-gray-100 dark:bg-white/10 shrink-0 mt-3" />
        </div>
      ))}
    </div>
  );
}
// ==========================================
// 🦴 Скелетон панели команды (страница /stat)
// ==========================================
export function StatSkeleton() {
  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717] animate-pulse">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/10" />
            <div>
              <div className="h-7 bg-gray-100 dark:bg-white/10 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-64" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-9 bg-gray-100 dark:bg-white/10 rounded-lg w-28" />
            <div className="h-9 bg-gray-100 dark:bg-white/10 rounded-lg w-28" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-xl p-4 space-y-3">
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-24" />
              <div className="h-7 bg-gray-100 dark:bg-white/10 rounded w-16" />
              <div className="h-8 bg-gray-100 dark:bg-white/5 rounded w-full" />
            </div>
          ))}
        </div>

        <div className="bg-gray-100 dark:bg-white/5 rounded-xl border border-line dark:border-white/10 p-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-line dark:border-white/5 last:border-0">
              <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
              <div className="flex-1 h-3 bg-gray-100 dark:bg-white/10 rounded w-32" />
              <div className="hidden sm:block h-3 bg-gray-100 dark:bg-white/5 rounded w-24" />
              <div className="hidden md:block h-3 bg-gray-100 dark:bg-white/5 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🦴 Скелетон раздела предложений (страница /suggestions)
// ==========================================
export function SuggestionsSkeleton() {
  return (
    <div className="min-h-screen bg-paper dark:bg-[#171717] animate-pulse">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="h-8 bg-gray-100 dark:bg-white/10 rounded w-56 mb-2" />
            <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-72" />
          </div>
          <div className="h-9 bg-gray-100 dark:bg-white/10 rounded-xl w-32" />
        </div>
        <div className="border border-line dark:border-white/10 rounded-2xl bg-gray-100 dark:bg-white/5 overflow-hidden">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-line dark:border-white/5 last:border-0">
              <div className="w-11 h-11 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-1/2" />
                <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-1/3" />
              </div>
              <div className="h-6 bg-gray-100 dark:bg-white/10 rounded-full w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
// ==========================================
// 🦴 Скелетон списка команды в выдвижной панели (TeamDrawer)
// ==========================================
export function TeamDrawerSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {[...Array(3)].map((_, g) => (
        <div key={g} className="space-y-3">
          <div className="flex items-center gap-3 pb-2 border-b border-line dark:border-white/5">
            <div className="w-1 h-6 rounded-full bg-gray-100 dark:bg-white/10" />
            <div className="h-3 bg-gray-100 dark:bg-white/10 rounded w-28" />
            <div className="ml-auto h-5 bg-gray-100 dark:bg-white/5 rounded-full w-8" />
          </div>
          <div className="space-y-1">
            {[...Array(3)].map((_, m) => (
              <div key={m} className="flex items-center gap-3 p-2.5">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 dark:bg-white/10 rounded w-28" />
                  <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 🦴 Скелетон мини-списка поиска пользователя (UserSearchField)
// ==========================================
export function UserSearchFieldSkeleton() {
  return (
    <div className="px-3 py-2 space-y-2 animate-pulse">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-white/10 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 bg-gray-100 dark:bg-white/10 rounded w-24" />
            <div className="h-2 bg-gray-100 dark:bg-white/5 rounded w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 🦴 РЕЗИНОВЫЕ СКЕЛЕТЫ
// Количество скелетов рассчитывается динамически:
//   (карточек в строке) * (строк на экране) + 2 запасные
// Замеряется реальная ширина контейнера и реальный размер карточки
// (с учётом gap), поэтому работает при любой сетке/брейкпоинте.
// ==========================================

type SkeletonSizeOptions = {
  /** минимальная ширина карточки (fallback до первого замера) */
  minCardWidth?: number;
  /** предполагаемая высота карточки (fallback до первого замера) */
  fallbackCardHeight?: number;
  /** gap между карточками (fallback до первого замера) */
  fallbackGap?: number;
  /** запасные карточки внизу */
  buffer?: number;
  /** не рисовать скелетов больше, чем реальных объектов */
  maxCount?: number;
};

/**
 * calculateSkeletonCount — считает число скелетов по формуле:
 * (карточек в строке) * (строк на экране) + buffer
 */
export function calculateSkeletonCount(
  containerWidth: number,
  viewportHeight: number,
  cardWidth: number,
  cardHeight: number,
  gap: number,
  buffer = 2
): number {
  if (containerWidth <= 0 || cardWidth <= 0 || cardHeight <= 0) return 0;

  // сколько карточек влезает в одну строку (учитываем gap между ними)
  const perRow = Math.max(1, Math.floor((containerWidth + gap) / (cardWidth + gap)));

  // сколько строк видно на экране (высота окна / высота карточки)
  const rowsOnScreen = Math.max(1, Math.floor(viewportHeight / (cardHeight + gap)));

  return perRow * rowsOnScreen + buffer;
}

/**
 * useResponsiveSkeletonCount — хук: замеряет контейнер и его первый
 * дочерний элемент (скелет) и возвращает нужное количество скелетов.
 * Пересчитывается на resize и при изменении размеров контейнера.
 */
export function useResponsiveSkeletonCount(
  containerRef: React.RefObject<HTMLElement | null>,
  {
    minCardWidth = 240,
    fallbackCardHeight = 120,
    fallbackGap = 16,
    buffer = 2,
    maxCount,
  }: SkeletonSizeOptions = {}
): number {
  const [count, setCount] = useState(0);

  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const containerWidth = el.clientWidth;
    const first = el.firstElementChild as HTMLElement | null;

    // реальная ширина/высота карточки (fallback, пока скелет не отрисован)
    let cardWidth = first ? first.offsetWidth : minCardWidth;
    let cardHeight = first ? first.offsetHeight : fallbackCardHeight;

    // реальный gap из computed style контейнера (grid/flex)
    let gap = fallbackGap;
    const cs = window.getComputedStyle(el);
    const colGap = parseFloat(cs.columnGap || cs.gap || "0");
    const rowGap = parseFloat(cs.rowGap || cs.gap || "0");
    if (!isNaN(colGap) && colGap > 0) gap = colGap;
    // высоту строки меряем с учётом вертикального gap
    cardHeight += isNaN(rowGap) ? 0 : rowGap;

    let next = calculateSkeletonCount(containerWidth, window.innerHeight, cardWidth, cardHeight, gap, buffer);
    // адаптация под количество реальных объектов: скелетов ≤ maxCount
    if (typeof maxCount === "number" && maxCount >= 0) next = Math.min(next, maxCount);
    setCount(next);
  }, [containerRef, minCardWidth, fallbackCardHeight, fallbackGap, buffer, maxCount]);

  useLayoutEffect(() => {
    recalc();

    const el = containerRef.current;
    if (!el) return;

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      // реагируем и на ресайз окна, и на изменение размеров контейнера
      ro = new ResizeObserver(recalc);
      ro.observe(el);
    }
    window.addEventListener("resize", recalc);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, [recalc, containerRef]);

  return count;
}

/**
 * ResponsiveSkeletons — рендерит N скелетов внутри контейнера.
 * Сначала рисует 1 скелет, чтобы замерить его реальный размер,
 * затем доводит количество до рассчитанного (perRow * rows + 2).
 */
export function ResponsiveSkeletons({
  containerRef,
  render,
  minCardWidth,
  fallbackCardHeight,
  fallbackGap,
  buffer = 2,
  maxCount,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  render: () => React.ReactNode;
  minCardWidth?: number;
  fallbackCardHeight?: number;
  fallbackGap?: number;
  buffer?: number;
  /** не рисовать скелетов больше, чем реальных объектов (например items.length или total из API) */
  maxCount?: number;
}) {
  // первый проход: 1 скелет для замера, потом реальное значение
  const measured = useRef(false);
  const dynamicCount = useResponsiveSkeletonCount(containerRef, {
    minCardWidth,
    fallbackCardHeight,
    fallbackGap,
    buffer,
    maxCount,
  });
  const count = measured.current ? dynamicCount : 1;

  useEffect(() => {
    if (count > 0) measured.current = true;
  }, [count]);

  return (
    <>
      {Array.from({ length: Math.max(1, count) }, (_, i) => (
        <div key={i}>{render()}</div>
      ))}
    </>
  );
}


// ==========================================
// 🦴 Скелетон таймлайна обновлений (страница /updates)
// ==========================================
export function UpdatesSkeleton() {
  return (
    <div className="relative pl-10 animate-pulse">
      <div className="absolute left-[13px] top-2 bottom-0 w-px bg-gray-100 dark:bg-white/10" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="relative mb-8">
          <span className="absolute -left-10 top-5 w-7 h-7 rounded-full border-2 border-line dark:border-white/10 bg-paper dark:bg-[#171717]" />
          <div className="border border-line dark:border-white/10 rounded-2xl p-5 bg-gray-100 dark:bg-white/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 bg-gray-100 dark:bg-white/10 rounded w-16" />
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-24" />
            </div>
            <div className="h-5 bg-gray-100 dark:bg-white/10 rounded w-2/3 mb-3" />
            <div className="space-y-2">
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-full" />
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-4/5" />
              <div className="h-3 bg-gray-100 dark:bg-white/5 rounded w-3/5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}