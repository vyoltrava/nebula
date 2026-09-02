"use client";

const EMOJIS = ["👍", "❤️", "🔥", "👏", "😢", "😮", "😂", "🎉"];

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <div
      className="bg-white dark:bg-[#1e1e1e] border border-line dark:border-white/15 rounded-xl shadow-xl p-2 flex gap-1 flex-wrap max-w-[280px]"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-lg"
        >
          {emoji}
        </button>
      ))}
      <button
        onClick={onClose}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-500 dark:text-white/40 text-xs"
      >
        ✕
      </button>
    </div>
  );
}
