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