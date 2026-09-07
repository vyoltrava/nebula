// ⏳ PERF: глобальный skeleton при переходах между маршрутами —
// даёт мгновенный визуальный отклик (улучшает FCP-восприятие) вместо белого экрана.
export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Загрузка">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        <span className="text-sm opacity-60">Загрузка…</span>
      </div>
    </div>
  );
}
