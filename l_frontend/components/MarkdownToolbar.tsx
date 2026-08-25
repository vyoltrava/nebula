"use client";
import { Bold, Italic, Code, Link2, Eye, AtSign, Hash } from "lucide-react";

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsert?: () => void; // колбэк после вставки (например, для обновления стейта)
}

export function MarkdownToolbar({ textareaRef, onInsert }: MarkdownToolbarProps) {
  const insertMarkdown = (before: string, after: string = "", placeholder: string = "текст") => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    
    const insertion = selectedText 
      ? `${before}${selectedText}${after}`
      : `${before}${placeholder}${after}`;
    
    const newText = text.substring(0, start) + insertion + text.substring(end);
    
    // Создаём синтетическое событие для обновления React state
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 
      "value"
    )?.set;
    nativeInputValueSetter?.call(textarea, newText);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    
    // Фокус и позиция курсора
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText 
        ? start + insertion.length 
        : start + before.length + placeholder.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      onInsert?.();
    }, 0);
  };

  const buttons = [
    { icon: Bold, label: "Жирный", action: () => insertMarkdown("**", "**", "жирный") },
    { icon: Italic, label: "Курсив", action: () => insertMarkdown("*", "*", "курсив") },
    { icon: Code, label: "Код", action: () => insertMarkdown("`", "`", "код") },
    { icon: Link2, label: "Ссылка", action: () => insertMarkdown("[", "](https://)", "текст") },
    { icon: Eye, label: "Спойлер", action: () => insertMarkdown("||", "||", "спойлер") },
    { icon: AtSign, label: "Упоминание", action: () => insertMarkdown("@", "", "username") },
    { icon: Hash, label: "Тег", action: () => insertMarkdown("#", "", "тег") },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-line dark:border-white/10 bg-white/[0.02]">
      {buttons.map((btn, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            btn.action();
          }}
          className="p-1.5 rounded-md text-gray-600 dark:text-white/50 hover:text-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10 transition-all active:scale-90"
          title={btn.label}
        >
          <btn.icon size={14} />
        </button>
      ))}
      <div className="ml-auto text-[10px] text-gray-500 dark:text-white/30">
        Поддерживается Markdown
      </div>
    </div>
  );
}