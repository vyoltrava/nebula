export function isOnline(lastSeen?: string | null): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
}

export function lastSeenText(lastSeen?: string | null): string {
  if (!lastSeen) return "не в сети";
  if (isOnline(lastSeen)) return "в сети";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `был(а) ${min} мин. назад`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `был(а) ${hours} ч. назад`;
  return `был(а) ${new Date(lastSeen).toLocaleDateString("ru-RU")}`;
}