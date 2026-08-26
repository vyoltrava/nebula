/**
 * Нормализует ответ API (поле detail) в человекочитаемую строку.
 * FastAPI при 422 отдаёт detail как массив объектов валидации —
 * без этой нормализации в UI попадает "[object Object],...".
 */
export function errMsg(data: unknown, fallback: string): string {
  let detail: unknown = data;
  if (data && typeof data === "object" && "detail" in (data as Record<string, unknown>)) {
    detail = (data as Record<string, unknown>).detail;
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const loc = Array.isArray(o.loc)
          ? (o.loc as unknown[]).filter((p) => p !== "body").join(".")
          : "";
        const msg = typeof o.msg === "string" ? o.msg : "";
        return [loc, msg].filter(Boolean).join(": ");
      }
      return String(item);
    }).filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.msg === "string") return o.msg;
    if (typeof o.message === "string") return o.message;
  }
  return fallback;
}