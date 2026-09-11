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

/**
 * 🖼 Возвращает Cloudinary-URL аватарки в ВЫСОКОМ разрешении.
 *
 * Проблема: у аватарок, загруженных старой версией эндпоинта, в URL
 * навсегда «впечена» малая трансформация (например /upload/c_fill,w_128/…).
 * Такая ссылка отдаёт 128px независимо от исходника — на retina-экранах
 * аватар «мылится». Лечится на лету: срезаем впечённую трансформацию
 * и запрашиваем у CDN свежую производную нужного размера.
 *
 * Не-Cloudinary URL возвращаются без изменений.
 */
export function cloudinaryHiRes(
  url: string | null | undefined,
  px = 1024
): string {
  if (!url) return "";
  const full = mediaUrl(url);
  const m = full.match(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i
  );
  if (!m) return full;

  const segs = m[2].split("/");
  const first = segs[0] ?? "";
  const isVersion = /^v\d+$/.test(first); // /v1712345678/ — версия, не трогаем
  // Трансформация: сегмент вида "c_fill,w_128" / "q_90" / цепочка через ","
  const looksTransform =
    !isVersion &&
    first.includes("_") &&
    /^[a-z][a-z0-9_]*(,[a-z0-9_.:\-]+)*$/i.test(first);

  const publicPath = looksTransform ? segs.slice(1).join("/") : m[2];
  return `${m[1]}c_limit,w_${px},q_90/${publicPath}`;
}