// FeedTabs.tsx
"use client";
import { useState } from "react";

export function FeedTabs() {
  const [tab, setTab] = useState<"all" | "following">("all");

  return (
    <div className="flex border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur z-10">
      {(["all", "following"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`flex-1 py-3 hover:bg-gray-50 ${
            tab === t ? "font-bold" : "text-gray-500"
          }`}
        >
          {t === "all" ? "Общая лента" : "Читаемые"}
        </button>
      ))}
    </div>
  );
}