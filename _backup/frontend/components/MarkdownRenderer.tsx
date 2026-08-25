"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import Link from "next/link";
import { STICKERS } from "@/lib/stickers";

// Предварительная обработка: превращаем кастомные синтаксисы в Markdown/HTML
function preprocessText(text: string): string {
  if (!text) return "";
  let processed = text;

  // 1. Стикеры :code: -> эмодзи
  processed = processed.replace(/:([a-zA-Z0-9_]+):/g, (match, code) => {
    const sticker = STICKERS.find((s) => s.code === code);
    return sticker ? sticker.emoji : match;
  });

  // 2. Спойлеры ||text|| -> HTML span
  processed = processed.replace(/\|\|(.*?)\|\|/g, '<span class="md-spoiler">$1</span>');

  // 3. Упоминания @username -> Markdown ссылка
  processed = processed.replace(/@([\wа-яёА-ЯЁ]+)/g, "[@$1](/mention/$1)");

  // 4. Теги #tag -> Markdown ссылка
  processed = processed.replace(/#([\wа-яёА-ЯЁ]+)/g, "[#$1](/tag/$1)");

  return processed;
}

export function MarkdownRenderer({ text, isMessage = false }: { text: string; isMessage?: boolean }) {
  if (!text) return null;

  const baseClass = isMessage ? "whitespace-pre-wrap break-words text-[15px] sm:text-sm md:text-base leading-snug" : "text-white/90 whitespace-pre-wrap break-words";

  return (
    <div className={`markdown-body ${baseClass}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Обработка ссылок (упоминания, теги, обычные URL)
          a: ({ node, href, children, ...props }) => {
            if (href?.startsWith("/mention/")) {
              const username = href.split("/").pop();
              return (
                <Link href={`/${username}`} className="font-bold text-pink-400 hover:text-pink-300 underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                  @{username}
                </Link>
              );
            }
            if (href?.startsWith("/tag/")) {
              const tag = href.split("/").pop();
              return (
                <Link href={`/tag/${tag}`} className="font-bold text-[#8b5cf6] hover:text-[#8b5cf6] underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                  #{tag}
                </Link>
              );
            }
            // Обычная ссылка
            const cleanHref = href?.replace(/[.,;:!?)]+$/, "") || "";
            return (
              <a href={cleanHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 break-all" onClick={(e) => e.stopPropagation()}>
                {cleanHref}
              </a>
            );
          },
// Обработка спойлеров
span: ({ node, className, children, ...props }) => {
  if (className === "md-spoiler") {
    return (
      <span
        className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-500/30 to-pink-500/30 hover:from-purple-500/40 hover:to-pink-500/40 border border-purple-400/50 text-white rounded-md px-2 py-0.5 cursor-pointer transition-all duration-200 select-none group"
        onClick={(e) => {
          e.stopPropagation();
          const el = e.currentTarget as HTMLElement;
          // Убираем градиент и рамку, показываем текст
          el.classList.remove(
            'from-purple-500/30', 'to-pink-500/30',
            'hover:from-purple-500/40', 'hover:to-pink-500/40',
            'border-purple-400/50'
          );
          el.classList.add('bg-white/10', 'border-white/20');
          // Меняем содержимое
          const icon = el.querySelector('.spoiler-icon');
          const content = el.querySelector('.spoiler-content');
          if (icon) icon.classList.add('hidden');
          if (content) {
            content.classList.remove('blur-sm', 'text-transparent');
            content.classList.add('text-white');
          }
        }}
      >
        <span className="spoiler-icon text-[10px] text-white/90 group-hover:text-white flex items-center gap-0.5 font-bold">
          👁 Спойлер
        </span>
        <span className="spoiler-content blur-sm text-transparent group-hover:blur-[1px] transition-all">
          {children}
        </span>
      </span>
    );
  }
  return <span {...props}>{children}</span>;
},
          // Инлайн код и блоки кода
          code: ({ node, className, children, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-pink-300" {...props}>{children}</code>;
            }
            return <code className="block bg-black/40 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2 border border-white/10" {...props}>{children}</code>;
          },
          // Абзацы (чтобы не было лишних отступов в сообщениях)
          p: ({ node, children, ...props }) => {
            if (isMessage) return <>{children}</>; // В сообщениях не оборачиваем в <p>, чтобы сохранить переносы строк
            return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
          },
          // Списки
          ul: ({ node, children, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props}>{children}</ul>,
          ol: ({ node, children, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props}>{children}</ol>,
          // Цитаты
          blockquote: ({ node, children, ...props }) => <blockquote className="border-l-3 border-[#8b5cf6] pl-3 text-white/70 italic my-2" {...props}>{children}</blockquote>,
          // Заголовки
          h1: ({ node, children, ...props }) => <h1 className="text-xl font-black mb-2" {...props}>{children}</h1>,
          h2: ({ node, children, ...props }) => <h2 className="text-lg font-bold mb-1" {...props}>{children}</h2>,
          h3: ({ node, children, ...props }) => <h3 className="text-base font-bold mb-1" {...props}>{children}</h3>,
        }}
      >
        {preprocessText(text)}
      </ReactMarkdown>
    </div>
  );
}