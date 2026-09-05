"use client";

/**
 * 🗂️ Модалка управления кастомными папками чатов (Этап 6).
 * Бэкенд: POST/PATCH/DELETE /api/chats/folders[...], привязка чатов.
 */

import { useCallback, useEffect, useState } from "react";
import { X, Plus, Trash2, Pencil, FolderPlus } from "lucide-react";
import { getToken } from "@/lib/auth";

export default function FolderManagerModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged?: () => void }) {
  const [folders, setFolders] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📁");
  const [busy, setBusy] = useState(false);
  // 🆕 Выбор чатов сразу при создании папки
  const [newChatIds, setNewChatIds] = useState<Set<number>>(new Set());
  const [showNewChats, setShowNewChats] = useState(false);
  // 🆕 Эмодзи-пикер: иконки грузятся так же, как реакции — из стикер-паков
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [emojiPacks, setEmojiPacks] = useState<any[]>([]);
  const [emojiPackTab, setEmojiPackTab] = useState(0);
  const FALLBACK_EMOJIS = ["📁", "💬", "💼", "🎮", "🎵", "🔥", "⭐", "💜", "🌙", "🚀", "🏆", "🐱", "🍕", "⚽", "📚", "✈️", "🎨", "💻", "😂", "😎"];

  useEffect(() => {
    if (!iconPickerOpen || emojiPacks.length) return;
    const token = getToken();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, { headers: { Authorization: `Bearer ${token || ""}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((packs) => setEmojiPacks(Array.isArray(packs) ? packs.filter((p: any) => (p.stickers || []).some((s: any) => s.type === "emoji")) : []))
      .catch(() => {});
  }, [iconPickerOpen, emojiPacks.length]);

  const api = (path: string, init?: RequestInit) => {
    const token = getToken();
    return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token || ""}`, ...(init?.headers || {}) },
    });
  };

  const load = useCallback(async () => {
    const [fRes, cRes] = await Promise.all([
      api("/api/chats/folders"),
      api("/api/chats"),
    ]);
    const fData = fRes.ok ? await fRes.json() : { folders: [] };
    setFolders(fData.folders || []);
    setChats(cRes.ok ? await cRes.json() : []);
    if (fData.folders?.length && selectedId === null) setSelectedId(fData.folders[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function createFolder() {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await api("/api/chats/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), icon: newIcon || "📁", chat_ids: Array.from(newChatIds) }),
    });
    if (res.ok) {
      const f = await res.json();
      setSelectedId(f.id);
      setNewName("");
      setNewIcon("📁");
      setNewChatIds(new Set());
      setShowNewChats(false);
    } else {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || "Ошибка создания папки");
    }
    setBusy(false);
    await load();
    onChanged?.();
  }

  async function renameFolder(id: number, current: string) {
    const name = prompt("Новое название папки:", current);
    if (!name || !name.trim()) return;
    setBusy(true);
    await api(`/api/chats/folders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    await load();
    onChanged?.();
  }

  async function deleteFolder(id: number) {
    if (!confirm("Удалить папку? Чаты останутся, но выйдут из неё.")) return;
    setBusy(true);
    await api(`/api/chats/folders/${id}`, { method: "DELETE" });
    setSelectedId(null);
    setBusy(false);
    await load();
    onChanged?.();
  }

  async function addChat(folderId: number, chatId: number) {
    setBusy(true);
    const res = await api(`/api/chats/folders/${folderId}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || "Не удалось добавить чат");
    }
    setBusy(false);
    await load();
    onChanged?.();
  }

  async function removeChat(folderId: number, chatId: number) {
    setBusy(true);
    await api(`/api/chats/folders/${folderId}/chats/${chatId}`, { method: "DELETE" });
    setBusy(false);
    await load();
    onChanged?.();
  }

  if (!open) return null;

  const selected = folders.find((f) => f.id === selectedId) || null;
  const selectedIds = new Set((selected?.chat_ids || []).map(String));
  const available = chats.filter((c) => !selectedIds.has(String(c.id)));
  const chatName = (c: any) => (c.is_group ? c.name : c.other?.display_name || "ЛС");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-[#1f1f23] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
            <FolderPlus size={18} className="text-purple-500" /> Папки чатов
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        {/* Создание */}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => setIconPickerOpen(!iconPickerOpen)}
            className="w-12 h-10 text-xl rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 hover:border-[#8b5cf6] transition-colors"
            title="Выбрать эмодзи-иконку"
          >
            {newIcon || "📁"}
          </button>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createFolder()}
            placeholder="Новая папка (например, Игры)"
            className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
          />
          <button onClick={createFolder} disabled={busy || !newName.trim()} className="px-3 py-2 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 disabled:opacity-50">
            <Plus size={16} />
          </button>
        </div>

        {/* 🆕 Эмодзи-пикер иконки: эмодзи из стикер-паков (как реакции) + любой ввод вручную */}
        {iconPickerOpen && (
          <div className="rounded-xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/5 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="Или вставь любой смайл…"
                className="flex-1 px-2 py-1.5 rounded-lg border border-line dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
              />
              <button onClick={() => setIconPickerOpen(false)} className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg"><X size={14} /></button>
            </div>
            {emojiPacks.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {emojiPacks.map((p: any, i: number) => (
                  <button
                    key={p.id ?? i}
                    onClick={() => setEmojiPackTab(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                      emojiPackTab === i ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50"
                    }`}
                  >
                    {p.name || `Пак ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto">
              {(emojiPacks[emojiPackTab]?.stickers || [])
                .filter((s: any) => s.type === "emoji")
                .map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => { setNewIcon(s.content); setIconPickerOpen(false); }}
                    className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-[#8b5cf6]/15 transition-colors ${newIcon === s.content ? "bg-[#8b5cf6]/25" : ""}`}
                  >
                    {s.content}
                  </button>
                ))}
              {FALLBACK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { setNewIcon(e); setIconPickerOpen(false); }}
                  className={`w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-[#8b5cf6]/15 transition-colors ${newIcon === e ? "bg-[#8b5cf6]/25" : ""}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 🆕 Выбор чатов, которые сразу попадут в новую папку */}
        <div className="rounded-xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/5">
          <button
            onClick={() => setShowNewChats(!showNewChats)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-700 dark:text-white/70"
          >
            <span>Чаты в новой папке{newChatIds.size ? `: ${newChatIds.size}` : ""}</span>
            <span className="text-gray-400">{showNewChats ? "▲" : "▼"}</span>
          </button>
          {showNewChats && (
            <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
              {chats.length === 0 && <p className="text-xs text-gray-500 dark:text-white/40 px-1 py-2">Нет доступных чатов</p>}
              {chats.map((c: any) => {
                const checked = newChatIds.has(c.id);
                return (
                  <label key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${checked ? "bg-[#8b5cf6]/15" : "hover:bg-gray-100 dark:hover:bg-white/5"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setNewChatIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        return next;
                      })}
                      className="accent-[#8b5cf6]"
                    />
                    <span className="truncate text-gray-900 dark:text-white">{chatName(c)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Список папок */}
        {folders.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-white/40 text-center py-4">Папок пока нет — создайте первую выше</p>
        ) : (
          <div className="space-y-2">
            {folders.map((f) => (
              <div key={f.id} className={`rounded-xl border p-3 space-y-2 ${selectedId === f.id ? "border-purple-500/60 bg-purple-500/5" : "border-line dark:border-white/10"}`}>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSelectedId(selectedId === f.id ? null : f.id)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                    <span>{f.icon}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-500 dark:text-white/40 bg-gray-100 dark:bg-white/10 px-1.5 rounded-full">{f.chat_ids.length}</span>
                  </button>
                  <button onClick={() => renameFolder(f.id, f.name)} className="p-1.5 text-gray-500 hover:text-purple-500 rounded-lg"><Pencil size={14} /></button>
                  <button onClick={() => deleteFolder(f.id)} className="p-1.5 text-gray-500 hover:text-red-500 rounded-lg"><Trash2 size={14} /></button>
                </div>

                {selectedId === f.id && (
                  <div className="space-y-1.5">
                    {f.chat_ids.map((cid: number) => {
                      const c = chats.find((x) => x.id === cid);
                      return (
                        <div key={cid} className="flex items-center gap-2 text-xs text-gray-700 dark:text-white/70 bg-gray-100 dark:bg-white/5 rounded-lg px-2 py-1.5">
                          <span className="flex-1 truncate">{c ? chatName(c) : `Чат #${cid}`}</span>
                          <button onClick={() => removeChat(f.id, cid)} className="text-red-500 hover:text-red-600"><X size={12} /></button>
                        </div>
                      );
                    })}
                    <select
                      value=""
                      onChange={(e) => e.target.value && addChat(f.id, Number(e.target.value))}
                      className="w-full text-xs rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/70 px-2 py-1.5 focus:outline-none focus:border-[#8b5cf6]"
                    >
                      <option value="">+ Добавить чат в папку…</option>
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>{chatName(c)}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


