"use client";

export function RecommendationFilters({
  value,
  onChange,
}: {
  value: "all" | "tags" | "activity";
  onChange: (v: "all" | "tags" | "activity") => void;
}) {
  return (
    <div className="flex gap-1.5 bg-gray-100 dark:bg-white/5 p-1 rounded-lg">
      {([
        { value: "all", label: "Все" },
        { value: "tags", label: "По интересам" },
        { value: "activity", label: "По активности" },
      ] as const).map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={
            value === opt.value
              ? "px-3 py-1.5 text-xs font-medium bg-[#8b5cf6] text-white rounded-lg transition-all"
              : "px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white transition-colors"
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
