// lib/plainText.ts — превращение Markdown/JSON в plain-текст для пушей и превью.
'use client';

/** Убирает Markdown-разметку (жирный, спойлер, код, ссылки, заголовки) -> plain text. */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  let s = text;
  s = s.replace(/\|\|(.+?)\|\|/g, '$1');          // спойлер ||скрытый||
  s = s.replace(/```[\s\S]*?```/g, ' [код] ');      // блок кода
  s = s.replace(/`+([^`]+)`+/g, '$1');            // инлайн-код `код`
  s = s.replace(/!\[([^\]]*)\]\([^)]+\)/g, ' 📷 '); // изображение
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');    // ссылка [текст](url)
  s = s.replace(/^\s{0,3}#{1,6}\s*/gm, '');        // заголовки
  s = s.replace(/\*\*(.+?)\*\*/g, '$1');           // **жирный**
  s = s.replace(/__(.+?)__/g, '$1');               // __жирный__
  s = s.replace(/(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1'); // *курсив*
  s = s.replace(/~~(.+?)~~/g, '$1');               // ~~зачёркнутый~~
  s = s.replace(/^\s*[-*+]\s+/gm, '');             // маркер-список
  s = s.replace(/[>|]\s*/gm, '');                  // цитаты / таблицы
  s = s.replace(/\s+/g, ' ');                      // множ. пробелы
  for (const sym of ['*', '_', '`']) {
    s = s.split(`\\${sym}`).join(sym);             // \* -> * и т.п.
  }
  return s.trim();
}
