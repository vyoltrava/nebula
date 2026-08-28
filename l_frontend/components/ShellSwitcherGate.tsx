"use client";

/**
 * 🎛️ Тянет глобальный флаг «смены оболочек» с сервера при старте приложения.
 * Сам ничего не рендерит: обновляет кэш (lib/shellSwitcher) и кидает событие,
 * по которому провайдеры тем скрывают/показывают переключатели и при
 * выключенном флаге сбрасывают всех в классическую тему.
 */
import { useEffect } from "react";
import { syncShellSwitcherFlag } from "@/lib/shellSwitcher";

export function ShellSwitcherGate() {
  useEffect(() => {
    syncShellSwitcherFlag();
  }, []);

  return null;
}