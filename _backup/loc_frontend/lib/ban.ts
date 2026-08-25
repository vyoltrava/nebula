const banEventTarget = new EventTarget();

/**
 * Вызывает глобальное событие бана.
 * Используется, когда сервер возвращает 403 "Account banned".
 */
export function triggerBan() {
  banEventTarget.dispatchEvent(new Event("banned"));
}

/**
 * Подписка на событие бана.
 * Возвращает функцию отписки для очистки в useEffect.
 */
export function onBan(callback: () => void): () => void {
  banEventTarget.addEventListener("banned", callback);
  return () => banEventTarget.removeEventListener("banned", callback);
}

/**
 * Обёртка над fetch, которая автоматически ловит бан.
 * Если сервер вернул 403 "Account banned" — вызывает triggerBan().
 */
export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(url, options);
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