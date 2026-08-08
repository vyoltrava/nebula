"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, Smile, Clapperboard, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";

export function CreatePost() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [user, setUser] = useState<{ avatar_url?: string | null } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (token) {
      setLogged(true);
      fetch("http://localhost:8000/api/me", {
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

  async function submit() {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const form = new FormData();
    form.append("text", text);
    if (file) form.append("file", file);

    const res = await fetch("http://localhost:8000/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (res.status === 401) {
      router.push("/login");
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
        {user?.avatar_url ? (
          <img
            src={`http://localhost:8000${user.avatar_url}`}
            alt=""
            className="w-10 h-10 rounded-full border border-white/20 object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full border border-white/20 bg-white/5 shrink-0" />
        )}
        <div className="flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что нового?"
            rows={3}
            className="w-full resize-none rounded-xl border border-white/15 bg-white/5 text-white placeholder-white/40 p-3 focus:outline-none focus:border-purple-400/50 focus:bg-white/10 transition-all"
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

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-3">
              <button className="text-white/60 hover:text-purple-400 transition-colors" onClick={() => fileRef.current?.click()}>
                <ImageIcon size={20} />
              </button>
              <button className="text-white/60 hover:text-purple-400 transition-colors" onClick={() => fileRef.current?.click()}>
                <Clapperboard size={20} />
              </button>
              <button className="text-white/60 hover:text-purple-400 transition-colors"><Smile size={20} /></button>
            </div>
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="border border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg px-5 py-2 transition-all hover:shadow-lg hover:shadow-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Опубликовать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}