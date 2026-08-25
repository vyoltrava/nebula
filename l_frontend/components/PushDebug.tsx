"use client";
import { useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

export function PushDebug() {
  const [lines, setLines] = useState<string[]>([]);

  async function run() {
    const L: string[] = [];
    
    // 1. Базовая диагностика окружения
    L.push(`standalone: ${(navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches}`);
    L.push(`permission: ${"Notification" in window ? Notification.permission : "нет Notification"}`);
    L.push(`PushManager: ${"PushManager" in window}`);

    // 2. Пытаемся зарегистрировать SW (это создаст новый если его нет)
    let reg: ServiceWorkerRegistration | null = null;
    try {
      reg = await navigator.serviceWorker.register("/sw.js");
      L.push(`register: ✅ scope=${reg.scope}`);
    } catch (e: any) {
      L.push(`register: ❌ ${e?.name}: ${e?.message}`);
    }

    // 3. Ждём пока SW станет ready (с таймаутом 5 сек)
    if (reg) {
      try {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((res) => setTimeout(() => res(null), 5000)),
        ]);
        if (readyReg) {
          L.push(`ready: ✅ active=${readyReg.active?.state}`);
        } else {
          L.push(`ready: ❌ таймаут 5 сек`);
        }
      } catch (e: any) {
        L.push(`ready: ❌ ${e?.name}: ${e?.message}`);
      }
    }

    // 4. Проверяем статус SW
    try {
      const currentReg = await navigator.serviceWorker.getRegistration();
      L.push(`SW: ${currentReg ? "да, active=" + (currentReg.active ? currentReg.active.state : "none") : "НЕТ"}`);
    } catch (e: any) {
      L.push(`SW ошибка: ${e?.name} ${e?.message}`);
    }

    // 5. Fetch vapid ключ
    let publicKey: string | null = null;
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/push/vapid`);
      const d = await r.json().catch(() => ({}));
      L.push(`vapid: HTTP ${r.status}, len=${d.public_key?.length ?? 0}`);
      if (r.ok && d.public_key) {
        publicKey = d.public_key;
      }
    } catch (e: any) {
      L.push(`vapid: ❌ ${e?.message}`);
    }

    // 6. Тестовая подписка
    if (publicKey && reg) {
      try {
        const readyReg = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<null>((res) => setTimeout(() => res(null), 3000)),
        ]);
        if (!readyReg) {
          L.push(`subscribe: ❌ SW не ready`);
        } else {
          const sub = await readyReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
          L.push(`subscribe: ✅ OK`);
          await sub.unsubscribe(); // снимаем тестовую подписку
        }
      } catch (e: any) {
        L.push(`subscribe: ❌ ${e?.name}: ${e?.message}`);
      }
    }

    // 7. Выводим результат
    setLines(L);
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        className="w-full py-2 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60 text-xs font-bold"
      >
        🔍 Диагностика пушей
      </button>
      {lines.length > 0 && (
        <pre className="mt-2 p-2 rounded-lg bg-black/50 text-[10px] text-emerald-600 dark:text-emerald-300 whitespace-pre-wrap break-all">
          {lines.join("\n")}
        </pre>
      )}
    </div>
  );
}