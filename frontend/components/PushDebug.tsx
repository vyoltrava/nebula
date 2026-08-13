"use client";
import { useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

export function PushDebug() {
  const [lines, setLines] = useState<string[]>([]);

  async function run() {
    const L: string[] = [];
    L.push(`standalone: ${(navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches}`);
    L.push(`permission: ${"Notification" in window ? Notification.permission : "нет Notification"}`);
    L.push(`PushManager: ${"PushManager" in window}`);

    try {
      const reg = await navigator.serviceWorker.getRegistration();
      L.push(`SW: ${reg ? "да, active=" + (reg.active ? reg.active.state : "none") : "НЕТ"}`);
    } catch (e: any) {
      L.push(`SW ошибка: ${e?.name} ${e?.message}`);
    }

    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/push/vapid`);
      const d = await r.json().catch(() => ({}));
      L.push(`vapid: HTTP ${r.status}, len=${d.public_key?.length ?? 0}`);

      if (r.ok && d.public_key) {
        // ждём SW максимум 5 сек, чтобы не зависнуть навечно
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((res) => setTimeout(() => res(null), 5000)),
        ]);
        if (!readyReg) {
          L.push("SW ready: ТАЙМАУТ 5 сек");
        } else {
          try {
            const sub = await readyReg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(d.public_key),
            });
            L.push(`subscribe: ✅ OK`);
            await sub.unsubscribe();
          } catch (e: any) {
            L.push(`subscribe: ❌ ${e?.name}: ${e?.message}`);  // ← ВОТ ТУТ ПРИЧИНА
          }
        }
      }
    } catch (e: any) {
      L.push(`fetch ошибка: ${e?.message}`);
    }
    setLines(L);
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        className="w-full py-2 rounded-lg bg-white/5 border border-white/15 text-white/60 text-xs font-bold"
      >
        🔍 Диагностика пушей
      </button>
      {lines.length > 0 && (
        <pre className="mt-2 p-2 rounded-lg bg-black/50 text-[10px] text-emerald-300 whitespace-pre-wrap break-all">
          {lines.join("\n")}
        </pre>
      )}
    </div>
  );
}