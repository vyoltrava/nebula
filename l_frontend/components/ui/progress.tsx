"use client";

import { useMemo } from "react";

export function Progress({ value, className, color }: {
  value: number; className?: string; color?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10 ${className || ""}`}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color || "#8b5cf6" }}
      />
    </div>
  );
}

export function MetricBar({
  label, value, color,
}: { label: string; value: number; color: string; }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium" style={{ color }}>{Math.round(value)}%</span>
      </div>
      <Progress value={value} color={color} />
    </div>
  );
}
