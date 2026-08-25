"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
}

// Глобальное состояние для вызова из любого места
let resolvePromise: ((value: boolean) => void) | null = null;

export function ConfirmModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    title: "Вы уверены?",
    variant: "default",
  });

  // Функция, которую мы будем вызывать из кода
  const showConfirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions({
      title: opts.title,
      description: opts.description,
      confirmText: opts.confirmText || (opts.variant === "danger" ? "Удалить" : "Подтвердить"),
      cancelText: opts.cancelText || "Отмена",
      variant: opts.variant || "default",
    });
    setIsOpen(true);
    
    return new Promise((resolve) => {
      resolvePromise = resolve;
    });
  }, []);

  // Делаем функцию доступной глобально
  if (typeof window !== "undefined") {
    (window as any).showCustomConfirm = showConfirm;
  }

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(true);
      resolvePromise = null;
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(false);
      resolvePromise = null;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]" onClick={handleCancel} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-200 overflow-hidden">
          
          {/* Header */}
          <div className="p-5 pb-0 flex items-start gap-4">
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              options.variant === "danger" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-[#8b5cf6]/10 text-[#8b5cf6]"
            }`}>
              <AlertTriangle size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{options.title}</h3>
              {options.description && (
                <p className="text-sm text-gray-600 dark:text-white/60 mt-1 leading-relaxed">{options.description}</p>
              )}
            </div>
            <IconButton icon={X} onClick={handleCancel} className="shrink-0" />
          </div>

          {/* Footer / Buttons */}
          <div className="p-5 pt-4 flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={handleCancel}>
              {options.cancelText}
            </Button>
            <Button
              variant={options.variant === "danger" ? "danger" : "primary"}
              onClick={handleConfirm}
            >
              {options.confirmText}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}