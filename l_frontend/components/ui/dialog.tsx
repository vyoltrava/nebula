"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

export function Dialog({ open, onOpenChange, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode;
}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">{children}</div>;
}

export function DialogContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={
        "relative bg-paper dark:bg-[#1a1a1e] border border-line dark:border-white/10 rounded-xl shadow-xl w-full max-w-2xl p-6 overflow-y-auto " +
        (className || "")
      }
    >
      {children}
    </div>
  );
}
