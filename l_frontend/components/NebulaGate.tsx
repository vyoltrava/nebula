"use client";

/**
 * 🌌 Гейт режима Nebula.
 * - В НЕБЕУЛА-режиме: рендерит NebulaSidebar вместо основного Sidebar
 *   (основной скрывается CSS-ом только пока включён режим) и пускает
 *   пользователя только в мессенджер (/messages*) и настройки Nebula.
 * - В обычном режиме компонент ничего не рендерит и ничего не меняет:
 *   соцсеть работает ровно как до внедрения Nebula.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNebulaMode } from "@/lib/useNebula";
import { NebulaSidebar } from "@/components/NebulaSidebar";

const NEBULA_CSS = `
/* Скрываем КЛАССИЧЕСКИЙ сайдбар (он рендерится как <aside> внутри .h-screen.flex)
   и разделитель — на любом странице, независимо от порядка детей */
html.nebula-mode .h-screen.flex > aside { display: none !important; }
html.nebula-mode .h-screen.flex > .w-px { display: none !important; }
/* Отступ под фиксированный Nebula-сайдбар — на body, чтобы работал
   на всех страницах (включая /nebula-profile без .h-screen каркаса) */
@media (min-width: 768px) {
  html.nebula-mode body {
    padding-left: var(--nebula-pad, 4rem) !important;
    transition: padding-left 0.3s ease;
  }
}
@media (max-width: 767px) {
  html.nebula-mode body { padding-left: 0 !important; }
}
/* Прячем плавающую кнопку "+" из списка чатов — создание чатов живёт в Nebula-сайдбаре */
html.nebula-mode div.fixed.top-4.right-4 { display: none !important; }
`;

export function NebulaGate() {
  const { isNebula } = useNebulaMode();
  const router = useRouter();
  const pathname = usePathname();
  // Важно: редиректим только после того, как localStorage прочитан,
  // иначе при перезагрузке /nebula-settings тебя выкидывает на /messages
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

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
    if (!ready || !isNebula) return;
    const allowed =
      pathname.startsWith("/messages") ||
      pathname.startsWith("/nebula-settings") ||
      pathname.startsWith("/nebula-profile") ||
      pathname.startsWith("/nebula-user") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/login");
    if (!allowed) router.replace("/messages");
  }, [ready, isNebula, pathname, router]);

  if (!ready || !isNebula) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: NEBULA_CSS }} />
      <NebulaSidebar />
    </>
  );
}