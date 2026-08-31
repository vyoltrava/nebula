"use client";

import { X } from "lucide-react";

export function CloseButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label || "Close"}
      className="p-1 rounded-lg text-gray-500 dark:text-white/50 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
    >
      <X size={18} />
    </button>
  );
}
