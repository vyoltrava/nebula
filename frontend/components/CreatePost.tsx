"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, Smile, Clapperboard, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { STICKERS } from "@/lib/stickers";
import { Avatar } from "@/components/Avatar";

export function CreatePost() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [user, setUser] = useState<{
    id: number;
    display_name: string;
    avatar_url?: string | null;
  } | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      setLogged(true);
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setUser);
    }
  }, []);

  function onFile(f: File | null) {
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  function insertSticker(code: string) {
    setText((prev) => prev + " " + code + " ");
    setShowStickers(false);
  }

  async function submit() {
    setError("");
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const form = new FormData();
    form.append("text", text);
    if (file) form.append("file", file);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    
    if (res.status === 429) {
      setError("Слишком много постов за минуту. Подождите немного.");
      return;
    }
    
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.detail ?? "Ошибка публикации");
      return;
    }
    
    setText("");
    onFile(null);
    triggerFeedRefresh();
  }

  if (!logged) {
    return (
      <div className="p-4 border-b border-white/10">
        <Link
          href="/login"
          className="block text-center border border-white/20 rounded-xl py-3 font-bold text-white/80 hover:bg-white/10 hover:text-white transition-all"
        >
          Войди, чтобы постить
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-white/10">
      <div className="flex gap-3">
        <Avatar
          src={user?.avatar_url}
          name={user?.display_name || "?"}
          id={user?.id}
        />
        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что нового?"
            rows={3}
            className="w-full resize-none rounded-xl border border-white/15 bg-white/5 text-white placeholder-white/40 p-3 focus:outline-none focus:border-[#8b5cf6] focus:bg-white/10 transition-all"
          />

          {preview && (
            <div className="relative inline-block mt-2">
              <img src={preview} alt="" className="max-h-48 rounded-xl border border-white/20" />
              <button
                onClick={() => onFile(null)}
                className="absolute -top-2 -right-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full p-1 hover:scale-110 transition-transform"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,image/gif"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />

          {error && (
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3 relative">
              <button className="text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()}>
                <ImageIcon size={20} />
              </button>
              <button className="text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()}>
                <Clapperboard size={20} />
              </button>
              <button
                className={`transition-colors ${showStickers ? "text-[#8b5cf6]" : "text-white/60 hover:text-[#8b5cf6]"}`}
                onClick={() => setShowStickers(!showStickers)}
              >
                <Smile size={20} />
              </button>

              {/* Панель стикеров */}
              {showStickers && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowStickers(false)} />
                  <div className="absolute top-full left-0 mt-2 p-3 border border-white/20 rounded-xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl z-50 w-64 max-h-72 overflow-y-auto">
                    <p className="text-xs font-bold text-white/60 mb-2 uppercase tracking-wider sticky top-0 bg-[#1f1f23]/95 pb-1">
                      Стикеры
                    </p>
                    <div className="grid grid-cols-5 gap-1">
                      {STICKERS.map((s) => (
                        <button
                          key={s.code}
                          onClick={() => insertSticker(s.code)}
                          className="text-2xl hover:bg-white/10 rounded-lg p-1.5 transition-colors"
                          title={s.label}
                        >
                          {s.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="bg-[#8b5cf6] text-white font-medium rounded-lg px-5 py-2 transition-all hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Опубликовать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}