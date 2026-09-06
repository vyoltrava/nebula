"use client";
// 🤖 BOT COMPANY — создание и управление ботами (как BotFather).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Bot, Plus, Trash2, Power, ScrollText, ArrowLeft, Zap, Check, X } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

type BotItem = {
  id: number; name: string; username: string | null; description: string | null;
  type: string; active: boolean; owner_id: number | null; owner_username: string | null;
  chat_id: number | null; triggers: { id: number; event: string; action: any; enabled: boolean }[];
};

const BOT_TYPES: [string, string, string][] = [
  ["custom", "Кастомный", "Свой бот с триггерами"],
  ["notify", "Уведомительный", "Шлёт уведомления по событиям"],
  ["poll", "Опросный", "Проводит опросы"],
  ["worker", "Рабочий", "Воркер отдела (создаётся админом)"],
];

const EVENTS: [string, string][] = [
  ["ticket_created", "Новая заявка"],
  ["ticket_assigned", "Заявку взяли"],
  ["ticket_closed", "Заявка закрыта"],
  ["rating_added", "Новая оценка"],
  ["member_joined", "Участник вступил"],
  ["member_left", "Участник вышел"],
  ["message", "Сообщение"],
];

export default function BotsPage() {
  const router = useRouter();
  const [bots, setBots] = useState<BotItem[]>([]);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [type, setType] = useState("custom");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logsBot, setLogsBot] = useState<BotItem | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [trigBot, setTrigBot] = useState<BotItem | null>(null);
  const [trigEvents, setTrigEvents] = useState<Set<string>>(new Set());
  const [chatPickBot, setChatPickBot] = useState<BotItem | null>(null);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const [botChatIds, setBotChatIds] = useState<Set<number>>(new Set());
  const [cmdsBot, setCmdsBot] = useState<BotItem | null>(null);
  const [cmds, setCmds] = useState<any[]>([]);

  async function load() {
    const token = getToken();
    if (!token) return router.push("/login");
    const meRes = await fetch(`${API_URL}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meRes.ok) return router.push("/login");
    setMe(await meRes.json());
    const res = await fetch(`${API_URL}/api/admin/bots`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setBots(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createBot(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError("");
    const res = await fetch(`${API_URL}/api/admin/bots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ name, type, username: username || undefined, description }),
    });
    setSaving(false);
    if (res.ok) {
      setShowCreate(false); setName(""); setUsername(""); setDescription(""); setType("custom");
      load();
    } else {
      const d = await res.json().catch(() => null);
      setError(d?.detail || "Ошибка создания");
    }
  }

  async function toggleBot(b: BotItem) {
    await fetch(`${API_URL}/api/admin/bots/${b.id}/toggle`, {
      method: "POST", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }

  async function deleteBot(b: BotItem) {
    if (!confirm(`Удалить бота «${b.name}»?`)) return;
    await fetch(`${API_URL}/api/admin/bots/${b.id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` },
    });
    load();
  }

  async function openLogs(b: BotItem) {
    setLogsBot(b); setLogs([]);
    const res = await fetch(`${API_URL}/api/admin/bots/${b.id}/logs`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setLogs(await res.json());
  }

  function openTriggers(b: BotItem) {
    setTrigBot(b);
    setTrigEvents(new Set(b.triggers.filter((t) => t.enabled).map((t) => t.event)));
  }

  async function openCommands(b: BotItem) {
    setCmdsBot(b); setCmds([]);
    const res = await fetch(`${API_URL}/api/admin/bots/${b.id}/commands`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setCmds(await res.json());
  }

  function updCmd(i: number, patch: any) {
    setCmds((prev: any[]) => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  }

  async function saveCommands() {
    if (!cmdsBot) return;
    const payload = cmds.map((c: any) => ({
      command: c.command, reply: c.reply, action: c.action, payload: c.payload || {},
    }));
    await fetch(`${API_URL}/api/admin/bots/${cmdsBot.id}/commands`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });
    setCmdsBot(null);
    load();
  }

  async function openChatPicker(b: BotItem) {
    setChatPickBot(b); setMyGroups([]); setBotChatIds(new Set());
    const token = getToken();
    const [chRes, inRes] = await Promise.all([
      fetch(`${API_URL}/api/chats`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/api/admin/bots/${b.id}/chats`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (chRes.ok) {
      const data = await chRes.json();
      setMyGroups((Array.isArray(data) ? data : []).filter((c: any) => c.is_group && !c.is_channel));
    }
    if (inRes.ok) {
      const list = await inRes.json();
      setBotChatIds(new Set((list || []).map((c: any) => c.id)));
    }
  }

  async function botAddChat(chatId: number) {
    if (!chatPickBot) return;
    await fetch(`${API_URL}/api/admin/bots/${chatPickBot.id}/add-to-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ chat_id: chatId }),
    });
    setBotChatIds((prev) => new Set([...prev, chatId]));
  }

  async function botRemoveChat(chatId: number) {
    if (!chatPickBot) return;
    await fetch(`${API_URL}/api/admin/bots/${chatPickBot.id}/remove-from-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ chat_id: chatId }),
    });
    setBotChatIds((prev) => { const n = new Set(prev); n.delete(chatId); return n; });
  }

  async function saveTriggers() {
    if (!trigBot) return;
    const triggers = [...trigEvents].map((event) => ({ event, action: {}, enabled: true }));
    await fetch(`${API_URL}/api/admin/bots/${trigBot.id}/triggers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(triggers),
    });
    setTrigBot(null);
    load();
  }

  const myBots = bots.filter((b) => me && (b.owner_username === me.username || b.owner_id === me.id));
  const workBots = bots.filter((b) => b.type === "worker");
  const otherBots = bots.filter((b) => b.type !== "worker" && !(me && (b.owner_username === me.username || b.owner_id === me.id)));

  function BotCard({ b }: { b: BotItem }) {
    return (
      <div className={`border rounded-xl p-4 transition-all ${b.active ? "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5" : "border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 opacity-50"}`}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${b.active ? "bg-purple-500/20 text-purple-600 dark:text-purple-300" : "bg-gray-300 dark:bg-white/10 text-gray-500"}`}>
              <Bot size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-gray-900 dark:text-white font-bold truncate">{b.name}</p>
              {b.username && <p className="text-gray-500 dark:text-white/40 text-xs truncate">@{b.username}</p>}
            </div>
          </div>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${b.active ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-gray-400/15 text-gray-500"}`}>
            {b.active ? "Активен" : "Выключен"}
          </span>
        </div>
        {b.description && <p className="text-gray-600 dark:text-white/50 text-xs mb-2">{b.description}</p>}
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-white/40 mb-3">
          <span className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-white/10 uppercase font-bold">{b.type}</span>
          {b.chat_id && <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-300">чат отдела</span>}
          <span>триггеров: {b.triggers.length}</span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => openCommands(b)} title="Программирование команд" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
            ⌨️ Команды
          </button>
          <button onClick={() => openChatPicker(b)} title="Добавить в чаты" className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
            💬 В чаты
          </button>
          <button onClick={() => openTriggers(b)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
            <Zap size={13} /> Триггеры
          </button>
          <button onClick={() => openLogs(b)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-xs font-bold hover:bg-purple-500/20 hover:text-purple-600 dark:hover:text-purple-300 transition-all">
            <ScrollText size={13} /> Логи
          </button>
          <button onClick={() => toggleBot(b)} title={b.active ? "Выключить" : "Включить"} className="p-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:text-amber-600 transition-all">
            <Power size={15} />
          </button>
          <button onClick={() => deleteBot(b)} title="Удалить" className="p-1.5 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 hover:text-red-600 transition-all">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-ivory dark:bg-[#18181b]">
      <div className="w-px shrink-0 bg-gray-100 dark:bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 border-b border-line dark:border-white/10 sticky top-0 bg-paper dark:bg-[#171717]/80 backdrop-blur-md z-10">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"><ArrowLeft size={20} /></Link>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2"><Bot size={26} className="text-[#8b5cf6]" /> BOT Company</h1>
                <p className="text-xs text-gray-600 dark:text-white/50 mt-0.5">Создавай своих ботов и управляй ими</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] transition-all">
              <Plus size={16} /> Создать бота
            </button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {loading && <p className="text-center text-gray-500 dark:text-white/40 py-16">Загрузка…</p>}
          {!loading && (
            <>
              <section>
                <h2 className="text-xs font-black uppercase text-gray-600 dark:text-white/50 mb-3">Мои боты ({myBots.length})</h2>
                {myBots.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-line dark:border-white/15 rounded-2xl bg-gray-100 dark:bg-white/5">
                    <Bot size={44} className="mx-auto text-gray-400 dark:text-white/20 mb-3" />
                    <p className="text-gray-600 dark:text-white/50 text-sm mb-1">У тебя пока нет ботов</p>
                    <p className="text-gray-500 dark:text-white/30 text-xs">Нажми «Создать бота» — как в Telegram, только здесь</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{myBots.map((b) => <BotCard key={b.id} b={b} />)}</div>
                )}
              </section>
              {workBots.length > 0 && (
                <section>
                  <h2 className="text-xs font-black uppercase text-gray-600 dark:text-white/50 mb-3">Рабочие боты отделов ({workBots.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{workBots.map((b) => <BotCard key={b.id} b={b} />)}</div>
                </section>
              )}
              {otherBots.length > 0 && (
                <section>
                  <h2 className="text-xs font-black uppercase text-gray-600 dark:text-white/50 mb-3">Другие боты ({otherBots.length})</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{otherBots.map((b) => <BotCard key={b.id} b={b} />)}</div>
                </section>
              )}
            </>
          )}
        </div>

        {/* ===== Модалка создания ===== */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => !saving && setShowCreate(false)}>
            <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Новый бот</h2>
              <form onSubmit={createBot} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Название *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60}
                    placeholder="Например: MyAwesomeBot"
                    className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Никнейм (уникальный)</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={32}
                    placeholder="my_awesome_bot (латиница, цифры, _)"
                    className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white focus:outline-none focus:border-[#8b5cf6]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-2">Тип</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BOT_TYPES.filter(([t]) => t !== "worker" || me?.is_admin).map(([t, label, desc]) => (
                      <button type="button" key={t} onClick={() => setType(t)}
                        className={`p-2.5 rounded-lg border text-left transition-all ${type === t ? "border-[#8b5cf6] bg-purple-500/10" : "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5"}`}>
                        <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1">{type === t && <Check size={12} className="text-[#8b5cf6]" />}{label}</p>
                        <p className="text-[10px] text-gray-500 dark:text-white/40">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-white/50 mb-1">Описание</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300}
                    placeholder="Чем занимается бот"
                    className="w-full border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white resize-none focus:outline-none focus:border-[#8b5cf6]" />
                </div>
                {error && <p className="text-red-600 dark:text-red-400 text-xs font-bold">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Отмена</button>
                  <button type="submit" disabled={saving} className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50">{saving ? "Создаю…" : "Создать"}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===== Модалка триггеров ===== */}
        {trigBot && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setTrigBot(null)}>
            <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-1">Триггеры</h2>
              <p className="text-xs text-gray-600 dark:text-white/50 mb-4">На какие события реагирует «{trigBot.name}»</p>
              <div className="space-y-1.5 mb-5">
                {EVENTS.map(([ev, label]) => (
                  <label key={ev} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${trigEvents.has(ev) ? "border-[#8b5cf6] bg-purple-500/10" : "border-line dark:border-white/15 bg-gray-100 dark:bg-white/5"}`}>
                    <input type="checkbox" checked={trigEvents.has(ev)}
                      onChange={() => setTrigEvents((prev) => { const n = new Set(prev); if (n.has(ev)) n.delete(ev); else n.add(ev); return n; })}
                      className="w-4 h-4 accent-purple-500" />
                    <span className="text-sm text-gray-800 dark:text-white/90 font-semibold">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTrigBot(null)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Отмена</button>
                <button onClick={saveTriggers} className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed]">Сохранить</button>
              </div>
            </div>
          </div>
        )}

        {/* ===== Модалка логов ===== */}
        {logsBot && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setLogsBot(null)}>
            <div className="w-full max-w-lg bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-4">Логи: {logsBot.name}</h2>
              {logs.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-white/40 py-8 text-sm">Записей пока нет</p>
              ) : (
                <div className="space-y-2">
                  {logs.map((l) => (
                    <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/5">
                      <div>
                        <p className="text-gray-900 dark:text-white text-xs font-bold">{l.action}</p>
                        {l.actor_username && <p className="text-gray-500 dark:text-white/40 text-[10px]">кто: @{l.actor_username}</p>}
                      </div>
                      <p className="text-gray-500 dark:text-white/40 text-[10px]">{l.created_at && new Date(l.created_at).toLocaleString("ru-RU")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* ===== Модалка «В чаты» ===== */}
        {chatPickBot && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setChatPickBot(null)}>
            <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-1">Бот в чатах</h2>
              <p className="text-xs text-gray-600 dark:text-white/50 mb-4">Где состоит «{chatPickBot.name}». Добавляй в свои группы — бот появится участником.</p>
              {myGroups.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-white/40 text-sm py-6">Нет групповых чатов</p>
              ) : (
                <div className="space-y-1.5">
                  {myGroups.map((g) => {
                    const inChat = botChatIds.has(Number(g.id));
                    return (
                      <div key={g.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-paper dark:bg-[#171717] border border-line dark:border-white/5">
                        <span className="text-sm text-gray-900 dark:text-white font-bold truncate flex-1">{g.name || `Чат #${g.id}`}</span>
                        <button onClick={() => inChat ? botRemoveChat(Number(g.id)) : botAddChat(Number(g.id))}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all ${inChat ? "bg-green-500/15 text-green-600 dark:text-green-300" : "bg-[#8b5cf6] text-white hover:bg-[#7c3aed]"}`}>
                          {inChat ? "В чате ✓" : "Добавить"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button onClick={() => setChatPickBot(null)} className="w-full mt-4 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Готово</button>
            </div>
          </div>
        )}
        {/* ===== Модалка команд (программирование) ===== */}
        {cmdsBot && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setCmdsBot(null)}>
            <div className="w-full max-w-lg bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl p-6 pointer-events-auto max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-black text-gray-900 dark:text-white mb-1">⌨️ Программирование: {cmdsBot.name}</h2>
              <p className="text-xs text-gray-600 dark:text-white/50 mb-4">
                Команды вида <b>/hello</b>. Действия: <b>Ответ</b> (текст), <b>Стикер</b> (прислать стикер из пака), <b>Стикер-бот</b> (создание стикеров).
              </p>
              <div className="space-y-3">
                {cmds.map((c: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 space-y-2">
                    <div className="flex gap-2">
                      <input value={c.command} onChange={(e) => updCmd(i, { command: e.target.value })}
                        placeholder="/hello" maxLength={40}
                        className="w-28 px-2.5 py-1.5 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:border-[#8b5cf6]" />
                      <select value={c.action} onChange={(e) => updCmd(i, { action: e.target.value })}
                        className="flex-1 px-2 py-1.5 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none">
                        <option value="reply_text">💬 Ответ текстом</option>
                        <option value="reply_sticker">🖼 Прислать стикер</option>
                        <option value="create_sticker">🎨 Стикер-бот (создание)</option>
                      </select>
                      <button onClick={() => setCmds((prev: any[]) => prev.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-gray-500 dark:text-white/40 hover:text-red-600"><X size={15} /></button>
                    </div>
                    <textarea value={c.reply} onChange={(e) => updCmd(i, { reply: e.target.value })}
                      placeholder="Ответ бота…"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-sm resize-none focus:outline-none focus:border-[#8b5cf6]" rows={2} />
                    {(c.action === "reply_sticker" || c.action === "create_sticker") && (
                      <input value={c.payload?.sticker_pack || ""} onChange={(e) => updCmd(i, { payload: { ...c.payload, sticker_pack: e.target.value } })}
                        placeholder="Название стикерпака (создастся при первом стикере)"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white text-xs focus:outline-none focus:border-[#8b5cf6]" />
                    )}
                  </div>
                ))}
                <button onClick={() => setCmds((prev: any[]) => [...prev, { command: "/new", reply: "", action: "reply_text", payload: {} }])}
                  className="w-full py-2 rounded-lg border border-dashed border-line dark:border-white/20 text-gray-600 dark:text-white/50 text-xs font-bold hover:border-[#8b5cf6] hover:text-[#8b5cf6]">
                  + Добавить команду
                </button>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setCmdsBot(null)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white/70 text-sm font-bold">Отмена</button>
                <button onClick={saveCommands} className="flex-1 py-2 rounded-lg bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed]">Сохранить</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
