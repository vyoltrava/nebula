// loc_frontend/lib/richText.ts

export type MarkdownType = "bold" | "italic" | "code" | "link" | "spoiler";

const MARKDOWN_MAP: Record<MarkdownType, { before: string; after: string }> = {
  bold: { before: "**", after: "**" },
  italic: { before: "*", after: "*" },
  code: { before: "`", after: "`" },
  link: { before: "[", after: "](https://)" },
  spoiler: { before: "||", after: "||" },
};

/* ================= Markdown -> HTML (визуал в редакторе) ================= */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(md: string): string {
  if (!md) return "";
  const stash: string[] = [];
  const put = (html: string) => `\u0000${stash.push(html) - 1}\u0000`;

  let text = escapeHtml(md);

  // 1) `код`
  text = text.replace(/`([^`\n]+)`/g, (_m, c: string) => put(`<code data-md="code">${c}</code>`));
  // 2) [ссылка](url)
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) =>
    put(`<a data-md="link" href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`));
  // 3) **жирный**
  text = text.replace(/\*\*([^*\n]+)\*\*/g, (_m, c: string) => put(`<strong data-md="bold">${c}</strong>`));
  // 4) *курсив*
  text = text.replace(/\*([^*\n]+)\*/g, (_m, c: string) => put(`<em data-md="italic">${c}</em>`));
  // 5) ||спойлер||
  text = text.replace(/\|\|([^|\n]+)\|\|/g, (_m, c: string) => put(`<span data-md="spoiler">${c}</span>`));

  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => stash[Number(i)]);
  text = text.replace(/\n/g, "<br>");
  return text;
}

/* ================= HTML -> Markdown (source of truth) ================= */

export function htmlToMarkdown(root: Node): string {
  let out = "";
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { out += "\n"; return; }
    const inner = htmlToMarkdown(el);
    switch (el.getAttribute("data-md") || tag) {
      case "bold": case "strong": case "b": out += `**${inner}**`; break;
      case "italic": case "em": case "i": out += `*${inner}*`; break;
      case "code": out += `\`${inner}\``; break;
      case "spoiler": out += `||${inner}||`; break;
      case "link": case "a": out += `[${inner}](${el.getAttribute("href") || "https://"})`; break;
      case "div": case "p": out += (out ? "\n" : "") + inner; break;
      default: out += inner;
    }
  });
  return out;
}

/* ================= Выделение слова под точкой клика/тапа ================= */

function rangeAtPoint(x: number, y: number): Range | null {
  const doc = document as any;
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    }
  }
  return null;
}

function wordBounds(text: string, offset: number): { start: number; end: number } | null {
  if (!text || offset > text.length) return null;
  let i = offset;
  // если кликнули в пробел — пробуем символ слева
  if ((text[i] === undefined || /\s/.test(text[i])) && i > 0) i--;
  if (text[i] === undefined || /\s/.test(text[i])) return null;
  let start = i, end = i;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  while (end < text.length && !/\s/.test(text[end])) end++;
  // обрезаем пунктуацию по краям
  while (start < end && /[.,;:!?()«»"']/ .test(text[start])) start++;
  while (end > start && /[.,;:!?()«»"']/.test(text[end - 1])) end--;
  if (start === end) return null;
  return { start, end };
}

/** Выделить слово под координатами (правый клик / long press). true если выделили. */
export function selectWordAtPoint(x: number, y: number): boolean {
  const range = rangeAtPoint(x, y);
  if (!range) return false;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const bounds = wordBounds(node.textContent ?? "", range.startOffset);
  if (!bounds) return false;
  const r = document.createRange();
  r.setStart(node, bounds.start);
  r.setEnd(node, bounds.end);
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}

/** Если выделение пустое (курсор внутри слова) — расширить до слова целиком. */
export function expandSelectionToWord(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return true;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return false;
  const bounds = wordBounds(node.textContent ?? "", range.startOffset);
  if (!bounds) return false;
  const r = document.createRange();
  r.setStart(node, bounds.start);
  r.setEnd(node, bounds.end);
  sel.removeAllRanges();
  sel.addRange(r);
  return true;
}

/** Координаты выделения (для позиционирования меню над словом). */
export function getSelectionCoordinates(): { x: number; y: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return { x: rect.left + rect.width / 2, y: rect.top - 8 };
}

export { MARKDOWN_MAP };