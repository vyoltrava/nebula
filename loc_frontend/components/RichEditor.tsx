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
  insertText: (t: string) => void; // вставка в позицию курсора (для упоминаний и т.п.)
  openMenuAt: (x: number, y: number) => void; // для кнопки Type
  getValue: () => string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  extraMenuItems?: RichMenuItem[]; // свои пункты поверх дефолтных
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void; // Enter для отправки и т.п.
};

export const RichEditor = forwardRef<RichEditorHandle, Props>(function RichEditor(
  { value, onChange, placeholder, className = "", extraMenuItems, onKeyDown },
  ref
) {
  const elRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>(value);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // long press (мобилки)
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

  // синхронизация value -> DOM (только если value пришёл ИЗВНЕ, не после нашего же input)
  useEffect(() => {
    const el = elRef.current;
    if (!el || value === lastEmitted.current) return;
    lastEmitted.current = value;
    const html = markdownToHtml(value);
    if (html !== el.innerHTML) el.innerHTML = html;
  }, [value]);


    // 🛡️ Глобально глушим нативное контекстное меню, когда наше открыто
    useEffect(() => {
    if (!menu) return;
    const suppress = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    };
    document.addEventListener("contextmenu", suppress, true);
    return () => document.removeEventListener("contextmenu", suppress, true);
    }, [menu]);

  // нормализация "пусто" для placeholder
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
        exec("paste"); // fallback (может быть заблокирован браузером)
      }
    },
    del: () => exec("delete"),
    selectAll: () => exec("selectAll"),
    format: (t: MarkdownType) => applyFormat(t),
  };

  function applyFormat(type: MarkdownType) {
    const el = elRef.current;
    if (!el) return;
    el.focus();
    expandSelectionToWord(); // нет выделения → форматируем слово под курсором
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);

    let node: HTMLElement;
    switch (type) {
      case "bold": node = document.createElement("strong"); break;
      case "italic": node = document.createElement("em"); break;
      case "code": node = document.createElement("code"); break;
      case "spoiler": node = document.createElement("span"); break;
      case "link": {
        const url = prompt("Введите URL:", "https://");
        if (!url) return;
        node = document.createElement("a");
        (node as HTMLAnchorElement).href = url;
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
        break;
      }
    }
    node.setAttribute("data-md", type);

    if (range.collapsed) {
      // вставляем плейсхолдер, выделенный форматом
      const ph = "текст";
      node.textContent = ph;
      range.insertNode(node);
      // ставим курсор внутрь
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
    elRef.current?.focus(); // ← ВОЗВРАЩАЕМ ФОКУС редактору
    
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed) {
        selectWordAtPoint(x, y); // пробуем выделить слово под кнопкой
    }
    setMenu({ x, y }); // ← ВСЕГДА открываем меню, даже если нет выделения
    }

  useImperativeHandle(ref, () => ({
    focus: () => elRef.current?.focus(),
    applyFormat,
    insertText: (t: string) => exec("insertText", t),
    openMenuAt,
    getValue: () => (elRef.current ? htmlToMarkdown(elRef.current) : value),
  }));

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
        onInput={() => { normalizeEmpty(); emit(); }}
        onKeyDown={(e) => {
          // хоткеи форматирования
          if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
            const k = e.key.toLowerCase();
            if (k === "b") { e.preventDefault(); applyFormat("bold"); return; }
            if (k === "i") { e.preventDefault(); applyFormat("italic"); return; }
            if (k === "e") { e.preventDefault(); applyFormat("code"); return; }
          }
          onKeyDown?.(e);
        }}
        // ❗️ Полностью глушим нативное меню (ПК + телефоны)
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenuAt(e.clientX, e.clientY);
        }}
        onPointerDown={(e) => {
        if (e.pointerType === "touch") {
            // Предотвращаем нативный long-press iOS/Android
            e.preventDefault();
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
    zIndex={9998} // ← ВЫШЕ z-50 меню +
  />
)}

      <style jsx>{`
.rich-editor {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  word-break: break-word;
  white-space: pre-wrap;
}
/* Разрешаем выделение только внутри выделенных нами слов */
.rich-editor ::selection {
  background: rgba(139, 92, 246, 0.4);
  color: white;
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
          background: #3a3a3f;
          color: transparent;
          border-radius: 4px;
        }
        .rich-editor a { color: #8b5cf6; text-decoration: underline; }
      `}</style>
    </>
  );
});