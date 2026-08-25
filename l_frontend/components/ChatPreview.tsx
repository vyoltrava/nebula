// loc_frontend/components/ChatPreview.tsx
"use client";
import React from "react";
import { STICKERS } from "@/lib/stickers";

/* ============ Inline-рендерер markdown для превью чатов ============ */

type Token =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "spoiler"; value: string }
  | { type: "link"; value: string }
  | { type: "mention"; value: string }
  | { type: "tag"; value: string };

// Паттерны markdown в порядке приоритета (важно: ** раньше *, spoiler раньше *)
const PATTERNS: { type: Token["type"]; re: RegExp }[] = [
  { type: "bold", re: /\*\*([^*\n]+)\*\*/ },
  { type: "spoiler", re: /\|\|([^|\n]+)\|\|/ },
  { type: "code", re: /`([^`\n]+)`/ },
  { type: "italic", re: /\*([^*\n]+)\*/ },
  { type: "link", re: /\[([^\]\n]+)\]\([^)\s]+\)/ },
  { type: "mention", re: /@([\wа-яёА-ЯЁ]+)/ },
  { type: "tag", re: /#([\wа-яёА-ЯЁ]+)/ },
];

function replaceStickers(text: string): string {
  return text.replace(/:([a-zA-Z0-9_]+):/g, (m, code) => {
    const s = STICKERS.find((x) => x.code === code);
    return s ? s.emoji : m;
  });
}

function tokenize(input: string): Token[] {
  // Схлопываем пробелы/переносы — превью всё равно в одну строку (truncate)
  let text = replaceStickers(input).replace(/\s+/g, " ").trim();
  const tokens: Token[] = [];

  while (text.length > 0) {
    let earliestIdx = -1;
    let earliestType: Token["type"] = "text";
    let earliestMatch: RegExpMatchArray | null = null;

    for (const p of PATTERNS) {
      const m = text.match(p.re);
      if (m && typeof m.index === "number") {
        if (earliestIdx === -1 || m.index < earliestIdx) {
          earliestIdx = m.index;
          earliestType = p.type;
          earliestMatch = m;
        }
      }
    }

    if (earliestIdx === -1 || !earliestMatch) {
      tokens.push({ type: "text", value: text });
      break;
    }

    if (earliestIdx > 0) {
      tokens.push({ type: "text", value: text.slice(0, earliestIdx) });
    }

    tokens.push({ type: earliestType, value: earliestMatch[1] });
    text = text.slice(earliestIdx + earliestMatch[0].length);
  }

  return tokens;
}

/* Подсветка поиска внутри текста */
function highlightText(text: string, q: string): React.ReactNode {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[#8b5cf6]/60 text-white rounded-sm px-0.5 font-semibold">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function renderToken(token: Token, q: string, key: number): React.ReactNode {
  switch (token.type) {
    case "text":
      return <span key={key}>{highlightText(token.value, q)}</span>;
    case "bold":
      return (
        <strong key={key} className="font-bold text-gray-800 dark:text-white/90">
          {highlightText(token.value, q)}
        </strong>
      );
    case "italic":
      return (
        <em key={key} className="italic text-gray-800 dark:text-white/80">
          {highlightText(token.value, q)}
        </em>
      );
    case "code":
      return (
        <code
          key={key}
          className="inline bg-gray-100 dark:bg-white/10 px-1 py-0.5 rounded text-[0.95em] font-mono text-pink-600 dark:text-pink-300"
        >
          {highlightText(token.value, q)}
        </code>
      );
    case "spoiler":
      return (
        <span
          key={key}
          className="inline-block align-middle mx-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40 italic text-[0.9em] border border-gray-200 dark:border-white/10"
        >
          спойлер
        </span>
      );
    case "link":
      return (
        <span key={key} className="text-sky-600 dark:text-sky-300 underline underline-offset-2">
          {highlightText(token.value, q)}
        </span>
      );
    case "mention":
      return (
        <span key={key} className="text-pink-600 dark:text-pink-400 font-semibold">
          @{highlightText(token.value, q)}
        </span>
      );
    case "tag":
      return (
        <span key={key} className="text-[#8b5cf6] font-semibold">
          #{highlightText(token.value, q)}
        </span>
      );
  }
}

export function ChatPreview({
  text,
  query = "",
}: {
  text: string | null | undefined;
  query?: string;
}) {
  if (!text) return null;
  const q = query.trim();
  const tokens = tokenize(text);
  return (
    <span className="chat-preview inline break-all">
      {tokens.map((t, i) => renderToken(t, q, i))}
    </span>
  );
}