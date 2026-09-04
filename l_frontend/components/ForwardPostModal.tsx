"use client";
// 📢 Модалка пересылки поста канала: в чат или другой канал.
import { useEffect, useState } from "react";
import { X, Megaphone, Users, Loader2, Send } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";

const API = process.env.NEXT_PUBLIC_API_URL;

export function ForwardPostModal({
  channelId,
  postId,
  onClose,
  onForwarded,
}: {
  channelId: number;
  postId: number;
  onClose: () => void;
  onForwarded: () => void;
}) {
  const [targets, setTargets] = useState<any[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    Promise.all([
      fetch(`${API}/api/chats`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/api/channels/my`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([chatsRes, channelsRes]) => {
      const chats = chatsRes.ok ? await chatsRes.json() : [];
      const channels = channelsRes.ok ? await channelsRes.json() : [];
      const chatItems = (chats.filter((c: any) => !c.is_secret) || []).map((c: any) => ({ ...c, is_channel: false }));
      const channelItems = (channels || []).map((ch: any) => ({
        id: ch.id, is_channel: true, is_group: false, name: ch.title,
        custom_slug: ch.custom_slug, avatar_url: ch.avatar_url, my_role: ch.my_role,
      }));
      setTargets([...chatItems, ...channelItems]);
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const forward = async (target: any) => {
    const token = getToken();
    if (!token) return;
    setBusy(target.id);
    setMsg("");
    try {
      const res = await fetch(`${API}/api/channels/${channelId}/posts/${postId}/forward`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: target.is_channel ? "channel" : "chat", target_id: target.id }),
      });
      if (res.ok) {
        setMsg("Переслано");
        onForwarded();
        onClose();
      } else {
        const d = await res.json().catch(() => null);
        setMsg(d?.detail || "Ошибка пересылки");
      }
    } catch {
      setMsg("Ошибка сети");
    }
    setBusy(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-[2150] bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[2151] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl pointer-events-auto animate-in zoom-in-95 duration-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2">
              <Send size={15} className="text-[#8b5cf6]" /> Переслать пост
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 max-h-[60vh]">
            {targets.map((c) => (
              <button
                key={(c.is_channel ? "ch-" : "chat-") + c.id}
                onClick={() => forward(c)}
                disabled={busy !== null}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left"
              >
                <div className={`w-10 h-10 rounded-xl shrink-0 overflow-hidden flex items-center justify-center ${c.is_channel ? "bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]" : "bg-gradient-to-br from-purple-500 to-indigo-600"}`}>
                  {c.is_channel ? <Megaphone size={18} className="text-white" />
                    : c.is_group ? <Users size={18} className="text-gray-900 dark:text-white" />
                    : c.other?.avatar_url ? <img src={mediaUrl(c.other.avatar_url)} alt="" className="w-full h-full rounded-xl object-cover" />
                    : <span className="text-gray-900 dark:text-white font-bold">{(c.other?.display_name || "?")[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {c.is_channel ? c.name : c.is_group ? c.name : c.other?.display_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-white/40 truncate">
                    {c.is_channel ? `@${c.custom_slug} — канал` : c.is_group ? `${c.members_count} участников` : `@${c.other?.username}`}
                  </p>
                </div>
                {busy === c.id && <Loader2 size={14} className="animate-spin text-[#8b5cf6] shrink-0" />}
              </button>
            ))}
            {targets.length === 0 && <p className="text-center text-gray-500 dark:text-white/40 text-sm py-8">Целей нет</p>}
          </div>
          {msg && <p className={`text-[11px] px-3 py-2 ${msg === "Переслано" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{msg}</p>}
        </div>
      </div>
    </>
  );
}