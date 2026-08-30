// lib/pwa/syncQueue.ts
// Очередь фоновой синхронизации: клиентская часть.
// При офлайне мутирующие запросы (с заголовком X-Nebula-Queueable: 1)
// перехватываются SW и складываются в IndexedDB, затем отправляются
// через Background Sync / при восстановлении сети.

const QUEUE_HEADER = "X-Nebula-Queueable";

/** Помечает мутирующий запрос как «ставимый в очередь при офлайне». */
export function queueable(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers);
  headers.set(QUEUE_HEADER, "1");
  return { ...options, headers };
}

/**
 * fetch с поддержкой офлайн-очереди: на GET возвращается обычный fetch,
 * на мутации добавляется заголовок для SW.
 */
export async function queueableFetch(
  url: string | URL | Request,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method || (url instanceof Request ? url.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD") {
    return fetch(url, options);
  }
  return fetch(url, queueable(options));
}

/** Считает количество ожидающих запросов в очереди (IndexedDB SW). */
export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = await openQueueDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("sync-queue", "readonly");
      const count = tx.objectStore("sync-queue").count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    });
  } catch {
    return 0;
  }
}

/** Просит SW немедленно проверить сеть и отправить очередь. */
export async function requestFlush(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "FLUSH_SYNC" });
  }
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no-indexeddb"));
    const req = indexedDB.open("nebula-sync", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sync-queue")) {
        db.createObjectStore("sync-queue", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}