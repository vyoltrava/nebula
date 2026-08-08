"use client";
import { useState } from "react";
import { Bookmark } from "lucide-react";
import { getToken } from "@/lib/auth";
import { isBookmarkedCached, setBookmarkedCache } from "@/lib/postCache";

export function BookmarkButton({ postId, initial }: { postId: number; initial?: boolean }) {
  const [bookmarked, setBookmarked] = useState<boolean>(() =>
    initial !== undefined ? initial : isBookmarkedCached(postId)
  );
  const [hasToken] = useState(() => !!getToken());

  if (!hasToken) return null;

  async function toggle() {
    const token = getToken();
    if (!token) return;

    // Оптимистично: меняем СРАЗУ
    const next = !bookmarked;
    setBookmarked(next);
    setBookmarkedCache(postId, next);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/bookmark`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const d = await res.json();
      if (d.bookmarked !== next) {
        setBookmarked(d.bookmarked);
        setBookmarkedCache(postId, d.bookmarked);
      }
    } else {
      // Откат при ошибке
      setBookmarked(!next);
      setBookmarkedCache(postId, !next);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`p-2 rounded-lg transition-all ${
        bookmarked
          ? "text-[#8b5cf6] bg-[#8b5cf6]/10"
          : "text-white/50 hover:text-[#8b5cf6] hover:bg-white/5"
      }`}
      title={bookmarked ? "Убрать из закладок" : "В закладки"}
    >
      <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
    </button>
  );
}