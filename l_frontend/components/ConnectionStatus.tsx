"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { getPendingSyncCount, requestFlush } from "@/lib/pwa/syncQueue";
import { API_URL } from "@/lib/apiUrl";

const PROBE_INTERVAL = 10_000; // проверка доступности API
const PROBE_TIMEOUT = 5_000;

/**
 * Индикатор сети. Офлайн определяется НЕ по navigator.onLine (на телефонах/
 * PWA он часто врёт и постоянно показывает «офлайн»), а реальным пингом API.
 * Жёлтый бейдж «Синхронизация · N» — нажатие просит SW отправить очередь и
 * пересчитывает счётчик.
 */
export default function ConnectionStatus() {
  const { t } = useI18n();

  const [probeFails, setProbeFails] = useState(false);
  const [pending, setPending] = useState(0);
  const [suppressedUntil, setSuppressedUntil] = useState(0);
  const inflight = useRef(false);

  // Реальный пинг доступности backend (устойчивее, чем navigator.onLine).
  useEffect(() => {
    const probe = async () => {
      if (inflight.current) return;
      inflight.current = true;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT);
        try {
          const res = await fetch(`${API_URL}/api/pwa/version`, {
            cache: "no-store",
            signal: ctrl.signal,
          });
          setProbeFails(!res.ok);
        } finally {
          clearTimeout(timer);
        }
      } catch {
        setProbeFails(true); // сеть недоступна / таймаут
      } finally {
        inflight.current = false;
      }
    };
    probe(); // сразу
    const id = setInterval(probe, PROBE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  // Счётчик ожидающей синхронизации (внешние события online/offline не трогаем).
  useEffect(() => {
    const refresh = () => getPendingSyncCount().then(setPending).catch(() => {});
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const online = !probeFails;
  const suppressed = Date.now() < suppressedUntil;

  if ((online && pending === 0) || suppressed) return null;

  return (
    <div
      className={`pointer-events-auto fixed bottom-4 right-4 z-[70] flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur ${
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
      {online ? (
        <button
          type="button"
          onClick={async () => {
            await requestFlush();
            getPendingSyncCount().then(setPending).catch(() => {});
          }}
          className="underline underline-offset-2"
          title={"Отправить"}
        >
          ↻
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setSuppressedUntil(Date.now() + 60_000)}
          className="underline underline-offset-2"
          title="Скрыть на минуту"
        >
          ✕
        </button>
      )}
    </div>
  );
}