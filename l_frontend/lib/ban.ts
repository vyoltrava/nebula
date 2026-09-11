const banEventTarget = new EventTarget();

/**
 * Вызывает глобальное событие бана.
 * Используется, когда сервер возвращает 403 "Account banned".
 */
export function triggerBan(payload?: BanPayload) {
  banEventTarget.dispatchEvent(new CustomEvent<BanPayload | undefined>("banned", { detail: payload }));
}

/**
 * Подписка на событие бана. Получает payload (причина + срок) или undefined.
 */
export function onBan(callback: (payload: BanPayload | undefined) => void): () => void {
  const h = (e: Event) => callback((e as CustomEvent<BanPayload | undefined>).detail);
  banEventTarget.addEventListener("banned", h);
  return () => banEventTarget.removeEventListener("banned", h);
}

/**
 * Обёртка над fetch, которая автоматически ловит бан.
 * Если сервер вернул 403 "Account banned" — вызывает triggerBan() с данными бана
 * (причина + срок в поле detail).
 */
export type BanPayload = {
  message?: string;
  reason?: string | null;
  until?: string | null;
};

export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
    // 🔴 Если сервер ответил «аккаунт забанен» — блокируем интерфейс модалкой.
    if (response.status === 403 || response.status === 401) {
      try {
        const clone = response.clone();
        const body = await clone.json().catch(() => null);
        const detail = body?.detail;
        const isBan =
          (typeof detail === "string" && String(detail).includes("Account banned")) ||
          (typeof detail === "object" && detail?.message === "Account banned");
        if (isBan) {
          // Срок истёк (401) — авто-разбан на сервере, пропускаем молча.
          if (response.status === 401) return response;
          const payload: BanPayload =
            typeof detail === "object" && detail?.message === "Account banned"
              ? detail
              : { message: "Account banned", reason: null, until: null };
          triggerBan(payload);
        }
      } catch {
        /* боди недоступно — пропускаем */
      }
    }
    return response;
  } catch (err) {
    // Сетевая ошибка — возвращаем фейковый Response с валидным статусом
    console.error("Network error:", err);
    return new Response(JSON.stringify({ detail: "Network error" }), {
      status: 503, // ✅ Service Unavailable (валидный статус)
      headers: { "Content-Type": "application/json" },
    });
  }
}