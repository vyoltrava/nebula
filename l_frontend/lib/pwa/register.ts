// lib/pwa/register.ts
// Регистрация Service Worker с умным обновлением и индикатором состояния.
// Безопасно для браузеров без поддержки Service Worker (feature detection).

export type SWState = "unsupported" | "unregistered" | "registering" | "installing" | "active" | "error";

export interface RegisterOptions {
  /** Вызывается, когда появилась новая версия SW и готова к активации. */
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
  /** Вызывается при изменении состояния регистрации. */
  onState?: (state: SWState, registration?: ServiceWorkerRegistration) => void;
  /** SW path. */
  swUrl?: string;
}

const canSW = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator;

/**
 * Регистрирует SW, обрабатывает жизненный цикл и уведомляет об обновлении.
 * Возвращает Promise<ServiceWorkerRegistration | null>.
 */
export async function registerServiceWorker(opts: RegisterOptions = {}): Promise<ServiceWorkerRegistration | null> {
  const { swUrl = "/sw.js", onUpdate, onState } = opts;

  if (!canSW()) {
    onState?.("unsupported");
    return null;
  }

  onState?.("registering");
  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope: "/" });

    onState?.("installing", registration);

    // Отслеживаем новый (waiting) воркер — значит есть обновление.
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing || registration.waiting;
      if (worker) {
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            // Новый SW установлен и ждёт — сообщаем о доступном обновлении.
            onUpdate?.(registration);
          }
        });
      }
    });

    /** Когда новый SW берёт контроль (из waiting в active). */
    const onControllerChange = () => {
      if (navigator.serviceWorker.controller) {
        onState?.("active", registration);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Сообщение от активного SW (обновление версии / призыв перезагрузиться).
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
      if (event.data && event.data.type === "SW_UPDATED") {
        onUpdate?.(registration);
      }
    });

    if (navigator.serviceWorker.controller) {
      onState?.("active", registration);
    }

    return registration;
  } catch (err) {
    console.error("[PWA] Ошибка регистрации SW:", err);
    onState?.("error");
    return null;
  }
}

/**
 * Просит waiting-воркера активироваться (skipWaiting) на текущей вкладке.
 */
export function skipWaitingOnCurrentPage(): void {
  const reg = navigator.serviceWorker?.controller?.scriptURL;
  if (!reg) return;
  navigator.serviceWorker.controller?.postMessage({ type: "SKIP_WAITING" });
}

/**
 * Принудительно обновляет SW (полезно после выхода новой версии на прод).
 */
export async function updateServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!canSW()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
    return reg ?? null;
  } catch (e) {
    console.error("[PWA] Ошибка update SW:", e);
    return null;
  }
}

export { canSW };

/**
 * Регистрирует фоновую периодическую синхронизацию (где поддерживается).
 * Требует Permission (periodic-background-sync) — молча пропускаем при отказе.
 */
export async function requestPeriodicSync(minIntervalMinutes = 60): Promise<void> {
  if (!canSW()) return;
  try {
    const status = await navigator.permissions.query({
      // периодический sync пока только в Chromium
      name: "periodic-background-sync" as PermissionName,
    });
    if (status.state !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
  const regAny = reg as unknown as {
    periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> };
  };
  if (regAny && typeof regAny.periodicSync?.register === "function") {
    await regAny.periodicSync.register("nebula-periodic-update", {
      minInterval: minIntervalMinutes * 60 * 1000,
    });
  }
  } catch {
    // Не поддерживается / нет доступа — это не критично.
  }
}