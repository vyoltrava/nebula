"use client";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { getToken } from "@/lib/auth";

export function BookmarkButton({ postId }: { postId: number }) {
  const [bookmarked, setBookmarked] = useState(false);
  const [hasToken] = useState(() => !!getToken());

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/is-bookmarked`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBookmarked(d.bookmarked))
      .catch(() => {});
  }, [postId]);

  if (!hasToken) return null;

  async function toggle() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/bookmark`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const d = await res.json();
      setBookmarked(d.bookmarked);
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