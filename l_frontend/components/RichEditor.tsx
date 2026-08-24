// loc_frontend/components/RichEditor.tsx
"use client";
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  MarkdownType, markdownToHtml, htmlToMarkdown, selectWordAtPoint, expandSelectionToWord,
} from "@/lib/richText";
import { RichContextMenu, RichMenuItem, buildRichMenuItems } from "./RichContextMenu";

export type RichEditorHandle = {
  focus: () => void;
  applyFormat: (t: MarkdownType) => void;
  insertText: (t: string) => void;
  openMenuAt: (x: number, y: number) => void;
  getValue: () => string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  extraMenuItems?: RichMenuItem[];
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
};

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { value, onChange, placeholder, className = "", extraMenuItems, onKeyDown },
  ref
) {
  const elRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null); // null → черновик отрисуется при монтировании
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lpPos = useRef({ x: 0, y: 0 });

  const emit = () => {
    const el = elRef.current;
    if (!el) return;
    let md = htmlToMarkdown(el);
    if (md.endsWith("\n")) md = md.slice(0, -1);
    lastEmitted.current = md;
    onChange(md);
  };

  // value -> DOM (черновики, редактирование, внешние изменения)
  useEffect(() => {
    const el = elRef.current;
    if (!el || value === lastEmitted.current) return;
    lastEmitted.current = value;
    const html = markdownToHtml(value);
    if (html !== el.innerHTML) el.innerHTML = html;
  }, [value]);

  const normalizeEmpty = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.innerHTML === "<br>" || (el.textContent === "" && el.children.length === 0)) el.innerHTML = "";
  };

  const exec = (cmd: string, arg?: string) => {
    elRef.current?.focus();
    document.execCommand(cmd, false, arg);
    normalizeEmpty();
    emit();
  };

  function makeFormatNode(type: MarkdownType): HTMLElement {
    let el: HTMLElement;
    switch (type) {
      case "bold": el = document.createElement("strong"); break;
      case "italic": el = document.createElement("em"); break;
      case "code": el = document.createElement("code"); break;
      default: el = document.createElement("span"); break; // spoiler
    }
    el.setAttribute("data-md", type);
    return el;
  }

  // 🆕 LIVE: допечатал ||x||, **x**, *x*, `x` → сразу становится оформленным узлом
  function commitPatternsAtCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    if ((node.parentElement as HTMLElement)?.closest("[data-md]")) return;
    const text = node.textContent ?? "";
    const caret = range.startOffset;
    const before = text.slice(0, caret);
    const patterns: { re: RegExp; type: MarkdownType }[] = [
      { re: /\|\|([^|\n]+)\|\|$/, type: "spoiler" },
      { re: /\*\*([^*\n]+)\*\*$/, type: "bold" },
      { re: /\*([^*\n]+)\*$/, type: "italic" },
      { re: /`([^`\n]+)`$/, type: "code" },
    ];
    for (const p of patterns) {
      const m = before.match(p.re);
      if (!m) continue;
      const inner = m[1];
      const s = caret - (inner.length + 2);
      if (s < 0) continue;
      const r = document.createRange();
      r.setStart(node, s);
      r.setEnd(node, caret);
      const el = makeFormatNode(p.type);
      el.textContent = inner;
      r.deleteContents();
      r.insertNode(el);
      const nr = document.createRange();
      nr.setStartAfter(el);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
      return;
    }
  }

  function applyFormat(type: MarkdownType) {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    expandSelectionToWord();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    let node: HTMLElement;
    if (type === "link") {
      const url = prompt("Введите URL:", "https://");
      if (!url) return;
      node = document.createElement("a");
      (node as HTMLAnchorElement).href = url;
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    } else {
      node = makeFormatNode(type);
    }
    node.setAttribute("data-md", type);

    if (range.collapsed) {
      node.textContent = "текст";
      range.insertNode(node);
      const r = document.createRange();
      r.selectNodeContents(node);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      try {
        range.surroundContents(node);
      } catch {
        const frag = range.extractContents();
        node.appendChild(frag);
        range.insertNode(node);
      }
      sel.removeAllRanges();
    }
    emit();
  }

  function openMenuAt(x: number, y: number) {
    elRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) {
      selectWordAtPoint(x, y);
    }
    setMenu({ x, y });
  }

  useImperativeHandle(ref, () => ({
    focus: () => elRef.current?.focus(),
    applyFormat,
    insertText: (t: string) => exec("insertText", t),
    openMenuAt,
    getValue: () => (elRef.current ? htmlToMarkdown(elRef.current) : value),
  }));

  const handlers = {
    undo: () => exec("undo"),
    redo: () => exec("redo"),
    cut: () => exec("cut"),
    copy: () => {
      const t = window.getSelection()?.toString() ?? "";
      if (t) navigator.clipboard?.writeText(t).catch(() => {});
    },
    paste: async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (t) exec("insertText", t);
      } catch {
        exec("paste");
      }
    },
    del: () => exec("delete"),
    selectAll: () => exec("selectAll"),
    format: (t: MarkdownType) => applyFormat(t),
  };

  const clearLp = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null; }
  };

  return (
    <>
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className={`rich-editor ${className}`}
        onInput={() => { commitPatternsAtCaret(); normalizeEmpty(); emit(); }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            const k = e.key.toLowerCase();
            if (k === "b") { e.preventDefault(); applyFormat("bold"); return; }
            if (k === "i") { e.preventDefault(); applyFormat("italic"); return; }
            if (k === "e") { e.preventDefault(); applyFormat("code"); return; }
          }
          onKeyDown?.(e);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenuAt(e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch") {
            lpPos.current = { x: e.clientX, y: e.clientY };
            clearLp();
            lpTimer.current = setTimeout(() => openMenuAt(lpPos.current.x, lpPos.current.y), 350);
          }
        }}
        onPointerUp={clearLp}
        onPointerMove={clearLp}
        onPointerLeave={clearLp}
      />

      {menu && (
        <RichContextMenu
          x={menu.x}
          y={menu.y}
          items={[...buildRichMenuItems(handlers), ...(extraMenuItems ?? [])]}
          onClose={() => setMenu(null)}
          zIndex={9998}
        />
      )}

      {/* ❗ ВАЖНО: global — иначе стили не доходят до динамически созданных узлов */}
      <style jsx global>{`
        .rich-editor {
          -webkit-touch-callout: none;
          word-break: break-word;
          white-space: pre-wrap;
          caret-color: #fff;
        }
        .rich-editor:empty::before {
          content: attr(data-placeholder);
          color: rgba(255, 255, 255, 0.4);
          pointer-events: none;
        }
        .rich-editor:focus { outline: none; }
        .rich-editor strong { font-weight: 700; }
        .rich-editor em { font-style: italic; }
        .rich-editor code {
          background: rgba(139, 92, 246, 0.15);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 4px;
          padding: 0 4px;
          font-family: ui-monospace, SFMono-Regular, monospace;
          color: #c4b5fd;
        }
        .rich-editor [data-md="spoiler"] {
          filter: blur(6px);
          opacity: .7;
          border-radius: 4px;
        }
        .rich-editor a { color: #8b5cf6; text-decoration: underline; }
        .rich-editor ::selection { background: rgba(139, 92, 246, 0.4); color: #fff; }
        @media (pointer: coarse) {
          .rich-editor {
            -webkit-user-select: none;
            user-select: none;
            touch-action: manipulation;
          }
        }
      `}</style>
    </>
  );
});