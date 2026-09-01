"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Users, Check } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function InvitePage() {
  const params = useParams();
  const tokenParam = params?.token as string;
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    (async () => {
      try {
        const res = await fetch(`${API}/api/invite/${tokenParam}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setInfo(await res.json());
        else setError((await res.json().catch(() => null))?.detail || "Приглашение не найдено");
      } catch { setError("Ошибка сети"); }
      finally { setLoading(false); }
    })();
  }, [tokenParam]);

  const join = async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    const res = await fetch(`${API}/api/invite/${tokenParam}/join`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { const d = await res.json(); setJoined(true); if (d.chat_id) router.push(`/messages/${d.chat_id}`); }
    else { const e = await res.json().catch(() => null); setError(e?.detail || "Не удалось вступить"); }
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-[#111] flex">
      <Sidebar />
      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-md mt-8">
          <h1 className="text-center text-2xl font-black text-gray-900 dark:text-white mb-6">Приглашение</h1>
          {loading && <p className="text-center text-gray-500">{API ? "Загрузка..." : ""}</p>}
          {error && <p className="text-center text-red-500">{error}</p>}
          {info && !error && (
            <div className="bg-white dark:bg-[#171717] border border-line dark:border-white/10 rounded-2xl p-6 flex flex-col gap-4 items-center">
              {info.avatar_url ? (
                <Avatar src={info.avatar_url} name={info.name} size={72} />
              ) : (
                <div className="w-18 h-18 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center p-4">
                  <Users size={40} className="text-gray-500 dark:text-white/40" />
                </div>
              )}
              <div className="text-center">
                <div className="text-xl font-bold text-gray-900 dark:text-white">{info.name}</div>
                <div className="text-sm text-gray-500 dark:text-white/40 mt-1">
                  {info.members_count} участников · Группа
                </div>
              </div>
              {info.is_member ? (
                <button onClick={() => router.push(`/messages/${info.chat_id}`)} className="px-4 py-2 rounded-xl bg-[#8b5cf6] text-white text-sm font-medium">
                  Открыть чат
                </button>
              ) : joined ? (
                <div className="flex items-center gap-1 text-green-600"><Check size={16} /> Вы вступили!</div>
              ) : (
                <button onClick={join} className="px-4 py-2 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white text-sm font-medium">
                  Вступить в группу
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}