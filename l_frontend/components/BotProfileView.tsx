"use client";
// 🤖 BotProfileView — специальная страница профиля бота.
// Боты — скрытая каста: вместо обычного профиля только аватарка,
// описание и две кнопки: «Написать» и «Добавить в чат».
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Bot, ArrowLeft, Users, MessageSquare, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function BotProfileView({ profile }: { profile: any }) {
  const router = useRouter();
  const [groups, setGroups] = useState<any[]>([]);
  const [showGroups, setShowGroups] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!showGroups) return;
    fetch(`${API_URL}/api/chats`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : d.chats || [];
        setGroups(arr.filter((c: any) => c.is_group && !c.is_secret));
      })
      .catch(() => setGroups([]));
  }, [showGroups]);

  async function writeMessage() {
    setError("");
    const res = await fetch(`${API_URL}/api/chats?other_user_id=${profile.id}`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const d = await res.json();
      router.push(`/messages/${d.chat_id}`);
    } else setError("Не удалось открыть чат с ботом");
  }

  async function addToChat(chatId: number) {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch(`${API_URL}/api/bots/join-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ chat_id: chatId, bot_user_id: profile.id }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok) {
        setMsg(d?.already ? "Бот уже в этом чате" : "Бот добавлен в чат ✓");
        setShowGroups(false);
      } else setError(d?.detail || "Не удалось добавить бота");
    } finally { setBusy(false); }
  }

  const avatar = profile.avatar_url
    ? (profile.avatar_url.startsWith("public:") ? profile.avatar_url.slice(7) : profile.avatar_url)
    : null;

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 overflow-y-auto border-x border-line dark:border-white/10 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="flex justify-start mb-4">
            <Link href="/messages" className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white">
              <ArrowLeft size={20} />
            </Link>
          </div>
          <div className="w-24 h-24 mx-auto rounded-2xl bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center overflow-hidden mb-4">
            {avatar
              ? <img src={avatar} alt={profile.display_name} className="w-full h-full object-cover" />
              : <Bot size={44} />}
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center justify-center gap-2">
            {profile.display_name}
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase">🤖 Бот</span>
          </h1>
          <p className="text-gray-500 dark:text-white/40 text-sm mt-1">@{profile.username}</p>
          {profile.bio && <p className="text-gray-600 dark:text-white/50 text-sm mt-3 break-words">{profile.bio}</p>}
          <p className="text-[11px] text-gray-400 dark:text-white/30 mt-2">
            Это бот. Его код — Python-файл с API-ключом.
          </p>

          <div className="flex gap-2 mt-6">
            <button onClick={writeMessage}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] transition-all">
              <MessageSquare size={15} /> Написать
            </button>
            <button onClick={() => { setShowGroups(!showGroups); setMsg(""); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
              <Users size={15} /> Добавить в чат
            </button>
          </div>

          {msg && <p className="text-green-600 dark:text-green-400 text-xs font-bold mt-3">{msg}</p>}
          {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold mt-3">{error}</p>}

          {showGroups && (
            <div className="mt-4 text-left space-y-1.5 max-h-60 overflow-y-auto">
              <p className="text-[11px] font-bold text-gray-500 dark:text-white/40 px-1">Мои группы:</p>
              {groups.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-xs py-4">Нет групповых чатов</p>}
              {groups.map((g) => (
                <button key={g.id} onClick={() => addToChat(g.id)} disabled={busy}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-gray-900 dark:text-white text-sm font-bold hover:border-[#8b5cf6] transition-all disabled:opacity-50">
                  <Users size={14} className="text-gray-500 dark:text-white/40 shrink-0" />
                  <span className="truncate flex-1 text-left">{g.name || `Чат #${g.id}`}</span>
                  {busy ? <Loader2 size={13} className="animate-spin shrink-0" /> : <span className="text-[#8b5cf6] text-xs font-black">+</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
