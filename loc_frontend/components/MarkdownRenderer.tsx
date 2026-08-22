"use client";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import Link from "next/link";
import { Copy, CheckSquare, ClipboardPaste } from "lucide-react";
import { STICKERS } from "@/lib/stickers";
import { selectWordAtPoint } from "@/lib/richText";
import { RichContextMenu, RichMenuItem } from "@/components/RichContextMenu";

/* ============ Предобработка (как было) ============ */
function preprocessText(text: string): string {
  if (!text) return "";
  let processed = text;
  processed = processed.replace(/:([a-zA-Z0-9_]+):/g, (match, code) => {
    const sticker = STICKERS.find((s) => s.code === code);
    return sticker ? sticker.emoji : match;
  });
  processed = processed.replace(/\|\|(.*?)\|\|/g, '<span class="md-spoiler">$1</span>');
  processed = processed.replace(/@([\wа-яёА-ЯЁ]+)/g, "[@$1](/mention/$1)");
  processed = processed.replace(/#([\wа-яёА-ЯЁ]+)/g, "[#$1](/tag/$1)");
  return processed;
}

/** Клик был по текстовому элементу (не по картинке / кнопке / видео)? */
function isTextTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return !["img", "video", "audio", "button", "input", "textarea", "svg"].includes(tag);
}

/* ============ КОМПОНЕНТ ============ */
export function MarkdownRenderer({ text, isMessage = false }: { text: string; isMessage?: boolean }) {
  // 🆕 Меню "по слову" живёт прямо в рендере
  const [menu, setMenu] = useState<{ x: number; y: number; items: RichMenuItem[] } | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpPos = useRef({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);

  const clearLp = () => {
    if (lpTimer.current) {
      clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  };

  // Закрываем меню при скролле / ресайзе
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const openWordMenu = (x: number, y: number, fullText: string) => {
    // 1. Выделяем слово под курсором/пальцем
    const didSelectWord = selectWordAtPoint(x, y);
    const selectedWord = didSelectWord ? (window.getSelection()?.toString() ?? "") : "";

    // 2. Строим пункты меню (легко добавлять новые — просто пуш в массив)
    const items: RichMenuItem[] = [
      {
        id: "copyWord",
        label: "Копировать слово",
        icon: Copy,
        disabled: !selectedWord,
        onClick: () => {
          if (selectedWord) navigator.clipboard?.writeText(selectedWord).catch(() => {});
        },
      },
      {
        id: "copyAll",
        label: "Копировать всё",
        icon: ClipboardPaste,
        onClick: () => navigator.clipboard?.writeText(fullText).catch(() => {}),
      },
      {
        id: "selectAll",
        label: "Выбрать всё",
        icon: CheckSquare,
        separatorBefore: true,
        onClick: () => {
          const root = rootRef.current;
          if (!root) return;
          const range = document.createRange();
          range.selectNodeContents(root);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
          }
        },
      },
    ];

    setMenu({ x, y, items });
  };

  if (!text) return null;

  const baseClass = isMessage
    ? "whitespace-pre-wrap break-words text-[15px] sm:text-sm md:text-base leading-snug"
    : "text-white/90 whitespace-pre-wrap break-words";

  return (
    <>
      <div
        ref={rootRef}
        className={`markdown-body ${baseClass}`}
        /* 🆕 ПКМ: только если клик был по тексту (не по картинке) */
        onContextMenu={(e) => {
          if (!isTextTarget(e.target)) return; // клик по картинке/кнопке → пустим к меню сообщения// ← даём всплыть → откроется MessageContextMenu
          e.preventDefault();
          e.stopPropagation(); // ← блокируем всплытие, чтобы MessageContextMenu не открылось
          openWordMenu(e.clientX, e.clientY, text);
        }}
        /* 🆕 Long-press (мобилки): 500мс удержания по тексту */
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          if (!isTextTarget(e.target)) return;
          lpPos.current = { x: e.clientX, y: e.clientY };
          clearLp();
          lpTimer.current = setTimeout(() => {
            // Вибрация как в ТГ
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              try { navigator.vibrate(25); } catch {}
            }
            openWordMenu(lpPos.current.x, lpPos.current.y, text);
          }, 500);
        }}
        onPointerUp={clearLp}
        onPointerLeave={clearLp}
        onPointerCancel={clearLp}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
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
              const cleanHref = href?.replace(/[.,;:!?)]+$/, "") || "";
              return (
                <a href={cleanHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-300 hover:text-sky-200 underline underline-offset-2 break-all" onClick={(e) => e.stopPropagation()}>
                  {cleanHref}
                </a>
              );
            },
            span: ({ node, className, children, ...props }) => {
              if (className === "md-spoiler") {
                return (
                  <span
                    className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-500/30 to-pink-500/30 hover:from-purple-500/40 hover:to-pink-500/40 border border-purple-400/50 text-white rounded-md px-2 py-0.5 cursor-pointer transition-all duration-200 select-none group"
                    onClick={(e) => {
                      e.stopPropagation();
                      const el = e.currentTarget as HTMLElement;
                      el.classList.remove(
                        'from-purple-500/30', 'to-pink-500/30',
                        'hover:from-purple-500/40', 'hover:to-pink-500/40',
                        'border-purple-400/50'
                      );
                      el.classList.add('bg-white/10', 'border-white/20');
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
            code: ({ node, className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return <code className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-pink-300" {...props}>{children}</code>;
              }
              return <code className="block bg-black/40 p-3 rounded-lg text-sm font-mono overflow-x-auto my-2 border border-white/10" {...props}>{children}</code>;
            },
            p: ({ node, children, ...props }) => {
              if (isMessage) return <>{children}</>;
              return <p className="mb-2 last:mb-0" {...props}>{children}</p>;
            },
            ul: ({ node, children, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props}>{children}</ul>,
            ol: ({ node, children, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props}>{children}</ol>,
            blockquote: ({ node, children, ...props }) => <blockquote className="border-l-3 border-[#8b5cf6] pl-3 text-white/70 italic my-2" {...props}>{children}</blockquote>,
            h1: ({ node, children, ...props }) => <h1 className="text-xl font-black mb-2" {...props}>{children}</h1>,
            h2: ({ node, children, ...props }) => <h2 className="text-lg font-bold mb-1" {...props}>{children}</h2>,
            h3: ({ node, children, ...props }) => <h3 className="text-base font-bold mb-1" {...props}>{children}</h3>,
          }}
        >
          {preprocessText(text)}
        </ReactMarkdown>
      </div>

      {menu && (
        <RichContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
          zIndex={9998}
        />
      )}
    </>
  );
}