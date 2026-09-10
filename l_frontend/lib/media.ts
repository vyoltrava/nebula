/**
 * Возвращает полный URL медиафайла.
 * Если URL уже абсолютный (Cloudinary) — возвращает как есть.
 * Если относительный (старые локальные файлы) — добавляет API_URL из окружения.
 */
export function mediaUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;

  // 🖼 "public:/file.png" — статика из public-папки ФРОНТЕНДА
  // (например аватар Bot_creator). Меняется простой заменой файла.
  if (url.startsWith("public:")) return url.slice("public:".length);

  // Берём полный URL (с https://) из переменных окружения
  return `${process.env.NEXT_PUBLIC_API_URL}${url}`;
}