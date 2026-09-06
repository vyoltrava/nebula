"use client";
// 🪐 СТИКЕРЫ — пользовательские стикерпаки (создаёт StickerBot / сам юзер).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Globe2, Plus, Trash2, Ban, Upload, ArrowLeft, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type St = { id: number; type: string; content: string; order: number };
type Pack = {
  id: number; name: string; is_user: boolean; banned: boolean;
  owner_id: number | null; owner_username: string | null; stickers: St[];
};

export default function StickersPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const token = getToken();
    if (!token) return router.push("/login");
    const meRes = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (meRes.ok) setMe(await meRes.json());
    const res = await fetch(`${API_URL}/api/sticker-packs/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPacks(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createPack() {
    const n = newName.trim();
    if (!n) return;
    await fetch(`${API_URL}/api/sticker-packs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ name: n, emojis: ["✨"] }),
    });
    setNewName("");
    load();
  }

  async function uploadSt(packId: number, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("emoji", "✨");
    await fetch(`${API_URL}/api/sticker-packs/${packId}/upload`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd,
    });
    load();
  }

  async function deletePack(packId: number, name: string) {
    if (!confirm(`Удалить пак «${name}»?`)) return;
    await fetch(`${API_URL}/api/sticker-packs/${packId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }

  async function adminDeleteSticker(stickerId: number) {
    await fetch(`${API_URL}/api/admin/user-stickers/${stickerId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }
  async function adminDeletePack(pack: Pack) {
    if (!confirm(`Удалить чужой пак «${pack.name}»?`)) return;
    await fetch(`${API_URL}/api/admin/user-packs/${pack.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }
  async function adminBanPack(pack: Pack) {
    if (!confirm(`Забанить @${pack.owner_username} вместе со всеми паками?`)) return;
    await fetch(`${API_URL}/api/admin/user-packs/${pack.id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ban: true, ban_user: true }),
    });
    load();
  }

  const isAdmin = me?.is_admin || me?.permissions?.includes("manage_stickers");
return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <Link href="/messages" className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"><ArrowLeft size={20} /></Link>
            <div className="flex-1">
              <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2"><Globe2 size={26} className="text-[#8b5cf6]" /> Мои стикеры</h1>
              <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">Пользовательские стикерпаки • создаются StickerBot-ом</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center gap-2 p-3 rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/5">
            <input value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createPack(); }}
              placeholder="Название нового стикерпака…"
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none" />
            <button onClick={createPack} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed]">
              <Plus size={14} /> Создать пак
            </button>
          </div>

          {loading && <p className="text-center text-gray-500 dark:text-white/40 py-12">Загрузка…</p>}

          {packs.length === 0 && !loading && (
            <div className="text-center py-12 border border-dashed border-line dark:border-white/15 rounded-2xl">
              <Globe2 size={44} className="mx-auto text-gray-400 dark:text-white/20 mb-3" />
              <p className="text-gray-600 dark:text-white/50 text-sm">Пока нет паков. Создай — или напиши StickerBot-у /newpack</p>
            </div>
          )}

          {packs.map((p) => (
            <div key={p.id} className={`border rounded-2xl overflow-hidden ${p.banned ? "border-red-500/40 bg-red-500/5 opacity-60" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5"}`}>
              <div className="p-3 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#8b5cf6]/15 text-[#8b5cf6] flex items-center justify-center shrink-0"><Globe2 size={18} /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate text-gray-900 dark:text-white">{p.name}
                    {p.banned && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 text-[10px] font-black uppercase">забанен</span>}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-white/40">{p.stickers.length} стикеров {p.owner_username ? `· @${p.owner_username}` : ""}</p>
                </div>
                <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold cursor-pointer hover:text-[#8b5cf6]">
                  <Upload size={14} /> Загрузить
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSt(p.id, f); e.target.value = ""; }} />
                </label>
                <button onClick={() => deletePack(p.id, p.name)} title="Удалить пак" className="p-1.5 text-gray-500 dark:text-white/40 hover:text-red-600"><Trash2 size={15} /></button>
                {isAdmin && !p.banned && (
                  <>
                    <button onClick={() => adminBanPack(p)} title="Бан юзера с паками" className="p-1.5 text-gray-500 dark:text-white/40 hover:text-red-600"><Ban size={15} /></button>
                    <button onClick={() => adminDeletePack(p)} title="Удалить пак (админ)" className="p-1.5 text-gray-500 dark:text-white/40 hover:text-red-600"><X size={15} /></button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-6 gap-1.5 p-2">
                {p.stickers.map((s) => (
                  <div key={s.id} className="relative group">
                    {s.type === "image" ? (
                      <img src={s.content} alt="" className="w-14 h-14 object-contain rounded-lg" />
                    ) : (
                      <span className="text-2xl w-14 h-14 flex items-center justify-center">{s.content}</span>
                    )}
                    {isAdmin && (
                      <button onClick={() => adminDeleteSticker(s.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 hidden group-hover:flex items-center justify-center text-white">
                        х
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
