"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { Lock, Trash2, RefreshCw } from "lucide-react";

export function IpSection({ me }: { me: any }) {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [newIp, setNewIp] = useState("");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState<number | "">("");

  async function load() {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setBlocks(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function createBlock() {
    if (!newIp.trim()) return;
    const token = getToken();
    const form = new FormData();
    form.append("ip_address", newIp.trim());
    form.append("reason", reason);
    if (typeof hours === "number" && hours > 0) form.append("hours", String(hours));
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    if (res.ok) { setNewIp(""); setReason(""); setHours(""); load(); }
    else { const d = await res.json().catch(() => null); alert(d?.detail ?? "Ошибка"); }
  }

  async function deleteBlock(id: number) {
    if (!confirm("Разблокировать IP?")) return;
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/ip-blocks/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) load();
  }

  return (
    <div className="space-y-6">
      <div className="border border-red-400/30 rounded-xl bg-red-500/5 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} className="text-red-400" />
          <h3 className="font-bold text-white">Заблокировать IP</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <input value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="IP адрес"
            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white font-mono focus:outline-none focus:border-red-400" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина"
            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-red-400" />
          <input type="number" value={hours} onChange={(e) => setHours(e.target.value ? Number(e.target.value) : "")} placeholder="Часов (пусто = навсегда)"
            className="border border-white/10 rounded-lg px-3 py-2 bg-white/5 text-white focus:outline-none focus:border-red-400" />
          <button onClick={createBlock} disabled={!newIp.trim()}
            className="bg-red-500 text-white font-bold rounded-lg py-2 hover:bg-red-600 disabled:opacity-40">
            Заблокировать
          </button>
        </div>
      </div>

      <div className="border border-white/10 rounded-xl bg-white/5 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="font-bold text-white">Заблокированные IP ({blocks.length})</h3>
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"><RefreshCw size={16} /></button>
        </div>
        {blocks.length === 0 ? (
          <p className="p-8 text-center text-white/50">Нет заблокированных IP</p>
        ) : (
          <div className="divide-y divide-white/5">
            {blocks.map((b) => (
              <div key={b.id} className="p-4 flex items-center gap-4 hover:bg-white/5">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                  <Lock size={18} className="text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-white font-bold">{b.ip_address}</p>
                  <div className="flex items-center gap-3 text-xs text-white/50 flex-wrap mt-1">
                    {b.reason && <span>Причина: {b.reason}</span>}
                    <span>Заблокирован: {new Date(b.created_at).toLocaleString("ru-RU")}</span>
                    {b.expires_at
                      ? <span className="text-yellow-400">До: {new Date(b.expires_at).toLocaleString("ru-RU")}</span>
                      : <span className="text-red-400 font-bold">НАВСЕГДА</span>}
                    {b.blocked_by && <span>Кем: {b.blocked_by.display_name}</span>}
                  </div>
                </div>
                <button onClick={() => deleteBlock(b.id)} className="p-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-500/10">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}