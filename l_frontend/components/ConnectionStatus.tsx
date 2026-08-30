"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { getPendingSyncCount } from "@/lib/pwa/syncQueue";

/**
 * Маленький индикатор состояния сети: показывает, офлайн вы или онлайн,
 * а также сколько запросов ожидает фоновой синхронизации.
 */
export default function ConnectionStatus() {
  const { t } = useI18n();
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Периодически обновляем счётчик очереди синхронизации.
    const timer = window.setInterval(() => {
      getPendingSyncCount().then(setPending).catch(() => {});
    }, 4000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(timer);
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      className={`pointer-events-none fixed bottom-4 right-4 z-[70] flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur ${
        online
          ? "bg-amber-500/90 text-black"
          : "bg-red-600/95 text-white"
      }`}
      role="status"
    >
      <span
        className={`h-2 w-2 rounded-full ${online ? "bg-black/70" : "animate-pulse bg-white"}`}
      />
      {online ? `${t("pwa.syncing")} · ${pending}` : t("pwa.offline")}
    </div>
  );
}