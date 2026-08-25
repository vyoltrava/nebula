export function timeAgo(date: string | Date | undefined): string {
  if (!date) return "";

  // ✅ ФИКС: если строка без таймзоны — считаем что это UTC
  let then: Date;
  if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+")) {
    then = new Date(date + "Z");
  } else {
    then = new Date(date);
  }

  if (isNaN(then.getTime())) return "";

  const now = new Date();
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


// lib/time.ts — добавь рядом с timeAgo

function parseServerDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  // Сервер отдаёт UTC без Z — принудительно говорим браузеру, что это UTC
  if (!date.endsWith("Z") && !date.includes("+")) {
    return new Date(date + "Z");
  }
  return new Date(date);
}

export function formatChatTime(iso: string): string {
  const d = parseServerDate(iso);
  if (isNaN(d.getTime())) return "";

  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return time;

  const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === d.toDateString();
  if (isYesterday) return `вчера, ${time}`;

  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}