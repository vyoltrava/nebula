export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHour < 6) return `${diffHour} ч назад`;
  if (diffDay < 1)
    return `сегодня в ${then.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDay < 2)
    return `вчера в ${then.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDay < 7) return `${diffDay} дн назад`;

  return then.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: now.getFullYear() !== then.getFullYear() ? "numeric" : undefined,
  });
}