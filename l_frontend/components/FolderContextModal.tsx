"use client";

/**
 * 🗂️ Меню папки чатов (правый клик / удержание на вкладке папки).
 * Переименовать · сменить значок (эмодзи из стикер-паков) · удалить ·
 * добавить/убрать чаты (рабочие чаты исключены).
 * Бэкенд: PATCH/DELETE /api/chats/folders[{/id}] , /api/chats/folders/{id}/chats[...]
 */

import { useCallback, useEffect, useState } from "react";
import { X, Save, Trash2 } from "lucide-react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";

export default function FolderContextModal({
  folderId,
  open,
  folderInitial,
  onClose,
  onChanged,
}: {
  folderId: number | null;
  open: boolean;
  /** 📦 Данные папки из уже загруженного списка (мгновенный рендер без запросов) */
  folderInitial?: any;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [folder, setFolder] = useState<any>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [busy, setBusy] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [emojiPacks, setEmojiPacks] = useState<any[]>([]);
  const [emojiPackTab, setEmojiPackTab] = useState(0);
  const FALLBACK_EMOJIS = ["📁", "💬", "💼", "🎮", "🎵", "🔥", "⭐", "💜", "🌙", "🚀", "🏆", "🐱", "🍕", "⚽", "📚", "✈️", "🎨", "💻", "😂", "😎"];

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const token = getToken();
    return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token || ""}`, ...(init?.headers || {}) },
    });
  }, []);

  // ⚡ Мгновенное открытие: инициализируемся из props, сеть — только в фоне
  const refresh = useCallback(async () => {
    if (folderId == null) return;
    try {
      const [fRes, cRes] = await Promise.all([api("/api/chats/folders"), api("/api/chats")]);
      const fData = fRes.ok ? await fRes.json() : { folders: [] };
      const f = (fData.folders || []).find((x: any) => x.id === folderId) || folderInitial || null;
      setFolder(f);
      setNewName(f?.name || "");
      setNewIcon(f?.icon || "");
      const cData = cRes.ok ? await cRes.json() : [];
      setChats(Array.isArray(cData) ? cData : []);
    } catch { /* ignore */ }
    setChatsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, api]);

  useEffect(() => {
    if (!open || folderId == null) return;
    setFolder(folderInitial || null);
    setNewName(folderInitial?.name || "");
    setNewIcon(folderInitial?.icon || "");
    setChatsLoading(true);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folderId, api]);

  const chatName = (c: any) => (c?.name || c?.other?.display_name || `Чат #${c.id}`);

  useEffect(() => {
    if (!iconPickerOpen || emojiPacks.length) return;
    const token = getToken();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, { headers: { Authorization: `Bearer ${token || ""}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((packs) => setEmojiPacks(Array.isArray(packs) ? packs.filter((p: any) => (p.stickers || []).some((s: any) => s.type === "emoji")) : []))
      .catch(() => {});
  }, [iconPickerOpen, emojiPacks.length]);

  if (!open || folderId == null) return null;
  if (!folder) return null;

  const folderChatIds = new Set<number>((folder.chat_ids || []).map(Number));
  const available = chats.filter((c) => !folderChatIds.has(Number(c.id)));

  async function saveChanges() {
    if (!newName.trim()) return;
    setBusy(true);
    const res = await api(`/api/chats/folders/${folderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), icon: newIcon || "📁" }),
    });
    setBusy(false);
    if (res.ok) onChanged?.();
    else {
      const e = await res.json().catch(() => ({}));
      alert(e.detail || "Ошибка сохранения");
    }
    await refresh();
  }

  async function addChat(chatId: number) {
    setBusy(true);
    const res = await api(`/api/chats/folders/${folderId}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
    });
    setBusy(false);
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.detail || "Не удалось добавить чат"); }
    await refresh(); onChanged?.();
  }

  async function removeChat(chatId: number) {
    setBusy(true);
    await api(`/api/chats/folders/${folderId}/chats/${chatId}`, { method: "DELETE" });
    setBusy(false);
    await refresh(); onChanged?.();
  }

  async function deleteFolder() {
    if (!confirm(t("messages.folderDeleteConfirm", { name: folder.name }))) return;
    setBusy(true);
    await api(`/api/chats/folders/${folderId}`, { method: "DELETE" });
    setBusy(false);
    onChanged?.();
    onClose();
  }

  return (
<>
      <div className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md max-h-[85vh] bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-in zoom-in-95 duration-200">
          {/* Шапка */}
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">{newIcon || folder.icon || "📁"}</span>
              <h2 className="text-lg font-black text-gray-900 dark:text-white truncate">{folder.name}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white rounded-lg"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Имя + значок */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-white/40">{t("messages.folderRename")}</label>
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(!iconPickerOpen)}
                  className="w-12 h-10 text-xl rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 hover:border-[#8b5cf6] transition-colors"
                  title={t("messages.folderIcon")}
                >
                  {newIcon || "📁"}
                </button>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveChanges()}
                  placeholder={t("messages.folderNamePlaceholder")}
                  className="flex-1 px-3 py-2 rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
                />
                <button onClick={saveChanges} disabled={busy || !newName.trim()} className="px-3 py-2 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1">
                  <Save size={14} />
                </button>
              </div>

              {/* Эмодзи-пикер */}
              {iconPickerOpen && (
                <div className="rounded-xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/5 p-3 space-y-2">
                  <input
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    placeholder={t("messages.folderOrPaste")}
                    className="w-full px-2 py-1.5 rounded-lg border border-line dark:border-white/15 bg-white dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:border-[#8b5cf6]"
                  />
                  {emojiPacks.length > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {emojiPacks.map((p: any, i: number) => (
                        <button
                          key={p.id ?? i}
                          onClick={() => setEmojiPackTab(i)}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 ${emojiPackTab === i ? "bg-[#8b5cf6] text-white" : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50"}`}
                        >
                          {p.name || `Пак ${i + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                    </div>
                  )}
            </div>

            {/* Чаты в папке */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-white/40">
                Чаты в папке · {folderChatIds.size}
              </label>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/5 p-2 space-y-1">
                {folderChatIds.size === 0 && !chatsLoading && <p className="text-xs text-gray-500 dark:text-white/40 px-1 py-2">{t("messages.folderEmpty")}</p>}
                {chatsLoading && (
                  <div className="space-y-1 px-1 py-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-7 rounded-lg bg-gray-200/70 dark:bg-white/5 animate-pulse" />
                    ))}
                  </div>
                )}
                {folder.chat_ids.map((cid: number) => {
                  const c = chats.find((x: any) => Number(x.id) === Number(cid));
                  return (
                    <div key={cid} className="flex items-center gap-2 text-xs text-gray-900 dark:text-white/80 rounded-lg px-2 py-1.5 bg-white dark:bg-white/5">
                      <span className="flex-1 truncate">{c ? chatName(c) : `Чат #${cid}`}</span>
                      <button onClick={() => removeChat(Number(cid))} className="text-red-500 hover:text-red-600" title={t("messages.folderRemoveChat")}><X size={12} /></button>
                    </div>
                  );
                })}
              </div>

              {/* Добавить чат */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-white/40">{t("messages.folderAddChats")}</label>
                {available.length === 0 && <p className="text-xs text-gray-500 dark:text-white/40 px-1">{t("messages.folderNoChats")}</p>}
                <div className="max-h-40 overflow-y-auto rounded-xl border border-line dark:border-white/10 bg-gray-50 dark:bg-white/5 p-1.5 space-y-1">
                  {chatsLoading && (
                    <div className="space-y-1 px-1 py-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-7 rounded-lg bg-gray-200/70 dark:bg-white/5 animate-pulse" />
                      ))}
                    </div>
                  )}
                  {available.map((c: any) => (
                    <button key={c.id} onClick={() => addChat(Number(c.id))}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs hover:bg-[#8b5cf6]/10 text-gray-900 dark:text-white/80 text-left">
                      <span className="flex-1 truncate">{chatName(c)}</span>
                      <span className="text-[#8b5cf6] text-sm font-black">+</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Удалить */}
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <button onClick={deleteFolder} disabled={busy}
                className="w-full px-3 py-2.5 rounded-xl text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors disabled:opacity-50">
                <Trash2 size={16} /> {t("messages.folderDelete")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
