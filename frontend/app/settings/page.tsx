"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { Upload } from "lucide-react";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetch("http://localhost:8000/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setUser(data);
        setDisplayName(data.display_name);
        if (data.avatar_url) {
          setPreview(`http://localhost:8000${data.avatar_url}`);
        }
      });
  }, []);

  async function saveProfile() {
    const token = getToken();
    if (!token) return;

    await fetch("http://localhost:8000/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName }),
    });

    if (fileRef.current?.files?.[0]) {
      const form = new FormData();
      form.append("file", fileRef.current.files[0]);
      await fetch("http://localhost:8000/api/me/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
    }

    router.push("/");
  }

  function onFile(f: File | null) {
    if (f) {
      setPreview(URL.createObjectURL(f));
    }
  }

  if (!user) return <div className="p-8 text-white/60">Загрузка...</div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-md mx-auto border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
        <h1 className="text-2xl font-black mb-6 text-white">Настройки профиля</h1>

        <div className="space-y-6">
          <div>
            <label className="block font-bold mb-2 text-white/80">Аватарка</label>
            <div className="flex items-center gap-4">
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="w-20 h-20 rounded-full border border-white/20 object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full border border-white/20 bg-white/5" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 border border-white/20 rounded-lg px-4 py-2 font-semibold text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
              >
                <Upload size={16} /> Выбрать фото
              </button>
            </div>
          </div>

          <div>
            <label className="block font-bold mb-2 text-white/80">Отображаемое имя</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-purple-400/50 transition-all"
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-white/80">Username</label>
            <input
              value={`@${user.username}`}
              disabled
              className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white/50"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveProfile}
              className="flex-1 border border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg py-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all"
            >
              Сохранить
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 border border-white/20 rounded-lg py-2 font-bold text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}