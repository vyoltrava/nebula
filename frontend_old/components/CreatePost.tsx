// CreatePost.tsx
"use client";
import { useState } from "react";

export function CreatePost() {
  const [text, setText] = useState("");

  return (
    <div className="p-4 border-b border-gray-200">
      <div className="flex gap-3">
        <img src="/avatar.png" alt="" className="w-10 h-10 rounded-full bg-gray-300" />
        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что нового?"
            rows={3}
            className="w-full resize-none focus:outline-none text-lg"
          />
          <div className="flex items-center justify-between border-t border-gray-100 pt-3">
            <div className="flex gap-3 text-gray-500">
              <button title="Фото">📷</button>
              <button title="Гифка">GIF</button>
            </div>
            <button
              disabled={!text.trim()}
              className="bg-blue-500 text-white font-semibold rounded-full px-5 py-2 disabled:opacity-50"
            >
              Опубликовать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}