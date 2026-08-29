"use client";

/**
 * 🌌 Гейт режима Nebula.
 * - В НЕБЕУЛА-режиме: рендерит NebulaSidebar вместо основного Sidebar
 *   (основной скрывается CSS-ом только пока включён режим) и пускает
 *   пользователя только в мессенджер (/messages*) и настройки Nebula.
 * - В обычном режиме компонент ничего не рендерит и ничего не меняет:
 *   соцсеть работает ровно как до внедрения Nebula.
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNebulaMode } from "@/lib/useNebula";
import { NebulaSidebar } from "@/components/NebulaSidebar";

const NEBULA_CSS = `
html.nebula-mode .h-screen.flex > div:first-child { display: none !important; }
html.nebula-mode .h-screen.flex > .w-px { display: none !important; }
@media (min-width: 768px) {
  html.nebula-mode .h-screen { padding-left: 16rem; }
  html.nebula-mode .h-screen.flex.overflow-hidden { padding-left: 16rem; }
}
`;

export function NebulaGate() {
  const { isNebula } = useNebulaMode();
  const router = useRouter();
  const pathname = usePathname();

  // Пометка <html> классом + инъекция CSS только на время режима
  useEffect(() => {
    if (isNebula) {
      document.documentElement.classList.add("nebula-mode");
      const style = document.createElement("style");
      style.id = "nebula-mode-style";
      style.textContent = NEBULA_CSS;
      document.head.appendChild(style);
      return () => {
        document.documentElement.classList.remove("nebula-mode");
        document.getElementById("nebula-mode-style")?.remove();
      };
    }
  }, [isNebula]);

  // Блокировка соцсети: только чаты и настройки Nebula
  useEffect(() => {
    if (!isNebula) return;
    const allowed =
      pathname.startsWith("/messages") ||
      pathname.startsWith("/nebula-settings");
    if (!allowed) router.replace("/messages");
  }, [isNebula, pathname, router]);

  if (!isNebula) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NEBULA_CSS }} />
      <NebulaSidebar />
    </>
  );
}