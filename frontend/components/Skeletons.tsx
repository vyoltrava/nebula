export function PostSkeleton() {
  return (
    <article className="p-4 border-b border-white/10 animate-pulse">
      <div className="flex gap-3">
        <div className="w-12 h-12 rounded-full bg-white/10 shrink-0" />
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

export function ProfileSkeleton() {
  return (
    <div className="animate-pulse border-b border-white/10">
      <div className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-5">
          {/* Аватарка */}
          <div className="flex justify-center md:justify-start">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/10" />
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