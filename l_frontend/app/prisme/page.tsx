"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, KeyRound, Lock, Search, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { PrismeScene, PrismeSceneObject } from "@/components/prisme/PrismeScene";
import { StatDisplay, Terminal, PrismeModal, PrismeTitle, errMsg } from "@/components/prisme/Retro";
import "@/components/prisme/prisme.css";

interface MyKey { object_id: number; slot: number; kind: string; chat_id: number }
interface AwaitingItem {
  chat_id: number; name: string | null;
  partner_username: string | null; partner_display_name: string | null;
}
interface SceneData {
  scene_id: number;
  name: string;
  expansion_level: number;
  object_count: number;
  free_count: number;
  occupied_count: number;
  chats_created: number;
  requests_total: number;
  keys_total: number;
  svg: string;
  my_keys: MyKey[];
  awaiting_my_key: AwaitingItem[];
  objects: PrismeSceneObject[];
}

interface Recipient { id: number; username: string; display_name: string; avatar_url?: string | null }

export default function PrismePage() {
  const router = useRouter();
  const [scene, setScene] = useState<SceneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  // Получатель нового чата
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [recQuery, setRecQuery] = useState("");
  const [recResults, setRecResults] = useState<Recipient[]>([]);
  const [recSearching, setRecSearching] = useState(false);
  const recTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Выбор объекта
  const [selected, setSelected] = useState<PrismeSceneObject | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  // Режим «ставлю СВОЙ ключ для приглашённого чата»
  const [keyFor, setKeyFor] = useState<AwaitingItem | null>(null);
  const [keyOk, setKeyOk] = useState<{ chat_id: number; slot: number; key: string; kind: string; already_set: boolean } | null>(null);

  // Успешное создание
  const [createdChat, setCreatedChat] = useState<{
    chat_id: number; slot: number; key: string; kind: string; other_username: string;
  } | null>(null);

  // Заявка на расширение
  const [reqOpen, setReqOpen] = useState(false);
  const [reqMsg, setReqMsg] = useState("");
  const [reqSending, setReqSending] = useState(false);
  const [reqSent, setReqSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      if (!token) { router.push("/login"); return; }
      const headers = { Authorization: `Bearer ${token}` };
      const [sceneRes, meRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/scene`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers }),
      ]);
      if (!sceneRes.ok) throw new Error("Не удалось загрузить Prisme Grid");
      setScene(await sceneRes.json());
      try {
        const me = await meRes.json();
        setIsAdmin(!!me.is_admin);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);

  // Поиск получателя (дебаунс; setState — внутри колбэка таймера)
  useEffect(() => {
    const q = recQuery.trim();
    if (recTimer.current) clearTimeout(recTimer.current);
    recTimer.current = setTimeout(async () => {
      if (!q || (recipient && recipient.username === q)) { setRecResults([]); return; }
      const token = getToken();
      if (!token) return;
      setRecSearching(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/users?q=${encodeURIComponent(q)}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) { setRecResults([]); return; }
        const data = await res.json();
        setRecResults(Array.isArray(data) ? data : (data.users || []));
      } catch {
        setRecResults([]);
      } finally {
        setRecSearching(false);
      }
    }, 350);
  }, [recQuery, recipient]);

  // Клик по СВОБОДНОМУ объекту
  const handleSelect = (obj: PrismeSceneObject) => {
    setConfirmError("");
    setSelected(obj);
  };

  // Клик по ЗАНЯТОМУ объекту: если это чат с моим участием — открываем
  const handleSelectOccupied = (obj: PrismeSceneObject) => {
    if (obj.i_am_member && obj.chat_id) {
      router.push(`/prisme/${obj.chat_id}`);
    }
  };

  // Подтверждение: создание чата ИЛИ установка своего ключа
  const confirmAction = async () => {
    if (!selected) return;
    setCreating(true);
    setConfirmError("");
    try {
      const token = getToken();
      let res: Response;
      if (keyFor) {
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/key`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ object_id: selected.id, chat_id: keyFor.chat_id }),
        });
      } else {
        if (!recipient) {
          setConfirmError("Сначала выберите получателя чата");
          return;
        }
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/chat`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ object_id: selected.id, other_user_id: recipient.id }),
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(errMsg(data, "Не удалось выполнить действие"));
        load();
        return;
      }
      if (keyFor) {
        setKeyOk({
          chat_id: data.chat_id, slot: data.slot, key: data.key,
          kind: data.kind, already_set: !!data.already_set,
        });
        setKeyFor(null);
      } else {
        setCreatedChat({
          chat_id: data.chat_id, slot: data.slot ?? 0, key: data.key ?? "",
          kind: data.kind ?? "", other_username: recipient?.username || "",
        });
        setRecipient(null);
        setRecQuery("");
      }
      setSelected(null);
      load();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setCreating(false);
    }
  };

  const sendRequest = async () => {
    setReqSending(true);
    setConfirmError("");
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: reqMsg }),
      });
      if (res.ok) {
        setReqSent(true);
        load();
      } else {
        let data: unknown = null;
        try { data = await res.json(); } catch { /* ignore */ }
        setConfirmError(errMsg(data, "Не удалось оставить заявку"));
      }
    } catch {
      setConfirmError("Ошибка сети");
    } finally {
      setReqSending(false);
    }
  };

  return (
    <div className="prv-root prv-crt min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Шапка */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              className="prv-btn prv-btn--ghost px-3"
              onClick={() => router.push("/messages")}
              aria-label="Назад"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <PrismeTitle>PRISME CHAT</PrismeTitle>
              <p className="prv-sub text-sm">У КАЖДОГО — СВОЙ ОБЪЕКТ-КЛЮЧ · ДИАЛОГ НА ДВОИХ</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="prv-chip"><span className="prv-dot free" /> свободно {scene ? scene.free_count : "—"}</span>
            {isAdmin && (
              <Link href="/admin/prisme" className="prv-btn prv-btn--purple py-2 px-3 text-sm">
                <Lock size={15} /> Админ-панель
              </Link>
            )}
          </div>
        </header>

        {/* Статистика */}
        {scene && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatDisplay label="Чатов создано" value={scene.chats_created} color="cyan" />
            <StatDisplay label="Ключей установлено" value={scene.keys_total} color="pink" />
            <StatDisplay label="Объектов" value={scene.object_count} color="purple" />
            <StatDisplay label="Расширений" value={scene.expansion_level} color="yellow" />
          </section>
        )}

        {/* Ждут моего ключа */}
        {scene && scene.awaiting_my_key.length > 0 && (
          <section className="mb-6 space-y-2">
            <Terminal tone="yellow">
              ВАС ПРИГЛАСИЛИ В PRISME-ЧАТ — ВЫБЕРИТЕ СВОЙ ЛИЧНЫЙ ОБЪЕКТ-КЛЮЧ.<span className="prv-cursor" />
            </Terminal>
            {scene.awaiting_my_key.map((a) => (
              <div key={a.chat_id} className="prv-card p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-sm" style={{ color: "#00F5FF" }}>
                    ЧАТ #{a.chat_id}{a.name ? ` · ${a.name}` : ""}
                  </div>
                  <div className="prv-sub text-xs mt-1">
                    с @{a.partner_username || "—"}{a.partner_display_name ? ` (${a.partner_display_name})` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`prv-btn text-sm ${keyFor?.chat_id === a.chat_id ? "" : "prv-btn--lime"}`}
                    onClick={() => {
                      setKeyFor(keyFor?.chat_id === a.chat_id ? null : a);
                      setSelected(null);
                      window.scrollTo({ top: 400, behavior: "smooth" });
                    }}
                  >
                    <KeyRound size={14} />
                    {keyFor?.chat_id === a.chat_id ? "Режим активен ✓" : "Выбрать мой ключ"}
                  </button>
                  <Link href={`/prisme/${a.chat_id}`} className="prv-btn prv-btn--ghost text-sm">
                    Открыть чат
                  </Link>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Получатель нового чата */}
        {!keyFor && (
          <section className="prv-card p-5 mb-6">
            <h3 className="prv-heading text-base prv-glow-cyan mb-1">Получатель диалога</h3>
            <p className="prv-sub text-xs mb-4">
              Prisme-чат создаётся на двоих: вы ставите свой объект-ключ, собеседник — свой.
            </p>
            {recipient ? (
              <div className="flex items-center justify-between gap-3 prv-chrome rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <Check size={18} style={{ color: "#39FF14" }} />
                  <div>
                    <div className="font-mono text-sm" style={{ color: "#39FF14" }}>@{recipient.username}</div>
                    <div className="prv-sub text-xs">{recipient.display_name}</div>
                  </div>
                </div>
                <button
                  className="prv-btn prv-btn--ghost px-2 py-1 text-sm"
                  onClick={() => { setRecipient(null); setRecQuery(""); }}
                  aria-label="Сбросить получателя"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    className="prv-input w-full pl-10"
                    placeholder="Поиск пользователя по имени…"
                    value={recQuery}
                    onChange={(e) => setRecQuery(e.target.value)}
                  />
                  {recSearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 prv-sub text-xs">поиск…</span>
                  )}
                </div>
                {recResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                    {recResults.map((u) => (
                      <button
                        key={u.id}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-transparent hover:border-[#00F5FF]/40 hover:bg-[#00F5FF]/5 transition-all text-left"
                        onClick={() => { setRecipient(u); setRecResults([]); }}
                      >
                        <span className="text-sm">@{u.username}</span>
                        <span className="prv-sub text-xs">{u.display_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Режим установки ключа */}
        {keyFor && (
          <section className="mb-6">
            <Terminal tone="cyan">
              РЕЖИМ КЛЮЧА: кликните свободный объект, чтобы поставить СВОЙ личный ключ для чата #{keyFor.chat_id}.
              <button
                className="prv-btn prv-btn--ghost ml-3 py-1 px-2 text-xs align-middle"
                onClick={() => { setKeyFor(null); setSelected(null); }}
              >
                Отменить режим
              </button>
            </Terminal>
          </section>
        )}

        {/* Мои ключи */}
        {scene && scene.my_keys.length > 0 && (
          <section className="prv-card p-4 mb-6">
            <h3 className="prv-heading text-base prv-glow-lime mb-3">Мои объекты-ключи</h3>
            <div className="space-y-2">
              {scene.my_keys.map((k) => (
                <div key={k.object_id} className="flex items-center justify-between gap-3 prv-chrome rounded-lg px-4 py-2.5">
                  <div className="font-mono text-sm">
                    <span style={{ color: "#39FF14" }}>#{String(k.slot).padStart(2, "0")}</span>{" "}
                    <span className="opacity-80">{k.kind}</span>
                  </div>
                  <Link href={`/prisme/${k.chat_id}`} className="prv-btn prv-btn--ghost py-1.5 text-xs">
                    Открыть чат #{k.chat_id}
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Картинка */}
        {loading && !scene && (
          <div className="prv-card p-10 text-center prv-sub">ЗАГРУЗКА СЦЕНЫ<span className="prv-cursor" /></div>
        )}
        {error && !loading && (
          <div className="prv-card p-6"><Terminal tone="red">{error}</Terminal></div>
        )}

        {scene && (
          <section className="prv-card p-2 sm:p-3 mb-6">
            <PrismeScene
              svg={scene.svg}
              objects={scene.objects}
              selectedSlot={selected?.slot}
              onSelect={handleSelect}
              onSelectOccupied={handleSelectOccupied}
              hint={
                keyFor
                  ? "Выберите свободный объект — он станет ВАШИМ ключом"
                  : "Свободный — создать чат · Занятый ваш — открыть"
              }
            />
            <p className="prv-sub text-xs px-2 pt-2 pb-1 text-center">
              У КАЖДОГО УЧАСТНИКА — СВОЙ ОБЪЕКТ-КЛЮЧ НА ЭТОЙ КАРТИНКЕ
            </p>
          </section>
        )}

        {/* Подтверждение: создание или ключ */}
        <PrismeModal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={keyFor ? "Ваш личный ключ" : "Подтверди ключ"}
        >
          {selected && (
            <div className="space-y-4">
              <div className="prv-terminal" style={{ borderColor: "#00F5FF8c", color: "#00F5FF" }}>
                {keyFor ? `СТАВЛЮ СВОЙ КЛЮЧ ДЛЯ ЧАТА #${keyFor.chat_id}:` : "ВАШ ВЫБОР:"}{" "}
                <b>#{selected.slot}</b> · {selected.label}
                {!keyFor && recipient && (
                  <div className="mt-1">ПОЛУЧАТЕЛЬ: @{recipient.username}</div>
                )}
                <pre className="mt-2 text-xs opacity-80">{`slot=${selected.slot} kind=${selected.kind}`}</pre>
              </div>
              {confirmError && <Terminal tone="red">{confirmError}</Terminal>}
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setSelected(null)} disabled={creating}>
                  Отмена
                </button>
                <button className={`prv-btn flex-1 ${keyFor ? "prv-btn--lime" : ""}`} onClick={confirmAction} disabled={creating}>
                  {creating ? "..." : keyFor ? "Поставить мой ключ" : "Создать чат"}
                </button>
              </div>
            </div>
          )}
        </PrismeModal>

        {/* Чат создан */}
        <PrismeModal open={!!createdChat} onClose={() => setCreatedChat(null)} title="Ключ активирован">
          {createdChat && (
            <div className="space-y-4">
              <Terminal tone="cyan">
                ЧАТ СОЗДАН. Ваш ключ: <b>#{createdChat.key}</b> · {createdChat.kind}.
                Собеседник @{createdChat.other_username} получил приглашение поставить свой ключ.
              </Terminal>
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setCreatedChat(null)}>Закрыть</button>
                <Link className="prv-btn flex-1 justify-center" href={`/prisme/${createdChat.chat_id}`}>
                  Перейти в чат
                </Link>
              </div>
            </div>
          )}
        </PrismeModal>

        {/* Ключ установлен */}
        <PrismeModal open={!!keyOk} onClose={() => setKeyOk(null)} title={keyOk?.already_set ? "Ключ уже был" : "Ваш ключ принят"}>
          {keyOk && (
            <div className="space-y-4">
              <Terminal tone="cyan">
                {keyOk.already_set ? "У вас уже был ключ для этого чата:" : "ВАШ ЛИЧНЫЙ КЛЮЧ УСТАНОВЛЕН:"}{" "}
                <b>#{keyOk.key}</b> · {keyOk.kind}. Канал полностью активен.
              </Terminal>
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setKeyOk(null)}>Закрыть</button>
                <Link className="prv-btn flex-1 justify-center" href={`/prisme/${keyOk.chat_id}`}>
                  Перейти в чат
                </Link>
              </div>
            </div>
          )}
        </PrismeModal>

        {/* Заявка на расширение */}
        <PrismeModal
          open={reqOpen}
          onClose={() => { setReqOpen(false); setReqSent(false); setReqMsg(""); }}
          title="Заявка на слот"
        >
          {reqSent ? (
            <div className="space-y-4">
              <Terminal tone="yellow">
                Ваша заявка оставлена. Администратор будет уведомлён и расширит картинку.<span className="prv-cursor" />
              </Terminal>
              <button
                className="prv-btn w-full"
                onClick={() => { setReqOpen(false); setReqSent(false); setReqMsg(""); }}
              >
                Понятно
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="prv-sub text-sm">Свободных объектов не осталось. Оставьте заявку — администратор расширит картинку.</p>
              <textarea
                className="prv-input w-full min-h-[90px] resize-none"
                placeholder="Комментарий (необязательно)"
                value={reqMsg}
                onChange={(e) => setReqMsg(e.target.value)}
              />
              {confirmError && <Terminal tone="red">{confirmError}</Terminal>}
              <button className="prv-btn prv-btn--lime w-full" onClick={sendRequest} disabled={reqSending}>
                {reqSending ? "Отправка..." : "Оставить заявку"}
              </button>
            </div>
          )}
        </PrismeModal>

        <div className="prv-zigzag mt-10" />
        <footer className="mt-4 text-center prv-sub text-xs">
          PRISME//GRID · синтвейв-ключи доступа · {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  );
}