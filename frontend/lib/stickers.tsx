import { ReactNode } from "react";

export const STICKERS = [
  { code: ":fire:", emoji: "🔥", label: "Огонь" },
  { code: ":heart:", emoji: "❤️", label: "Любовь" },
  { code: ":laugh:", emoji: "😂", label: "Смех" },
  { code: ":cry:", emoji: "😭", label: "Плачу" },
  { code: ":think:", emoji: "🤔", label: "Думаю" },
  { code: ":cool:", emoji: "😎", label: "Круто" },
  { code: ":angry:", emoji: "😡", label: "Злость" },
  { code: ":wave:", emoji: "👋", label: "Привет" },
  { code: ":clap:", emoji: "👏", label: "Аплодисменты" },
  { code: ":rocket:", emoji: "🚀", label: "Ракета" },
  { code: ":star:", emoji: "⭐", label: "Звезда" },
  { code: ":ghost:", emoji: "👻", label: "Призрак" },
  { code: ":skull:", emoji: "💀", label: "Череп" },
  { code: ":party:", emoji: "🎉", label: "Пати" },
  { code: ":cat:", emoji: "🐱", label: "Кот" },
  { code: ":dog:", emoji: "🐶", label: "Пёс" },
  { code: ":fox:", emoji: "🦊", label: "Лиса" },
  { code: ":unicorn:", emoji: "🦄", label: "Единорог" },
  { code: ":rainbow:", emoji: "🌈", label: "Радуга" },
  { code: ":zap:", emoji: "⚡", label: "Молния" },
] as const;

// Парсит :code: в тексте и заменяет на крупные эмодзи
export function renderStickers(text: string): ReactNode[] {
  const parts = text.split(/(:[\w]+:)/g);
  return parts.map((part, i) => {
    const sticker = STICKERS.find((s) => s.code === part);
    if (sticker) {
      return (
        <span key={i} className="inline-block text-3xl align-middle mx-0.5" title={sticker.label}>
          {sticker.emoji}
        </span>
      );
    }
    return part;
  });
}