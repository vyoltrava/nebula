"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, KeyRound, Lock, LogIn, Plus, Unlock } from "lucide-react";
import { getToken } from "@/lib/auth";
import { PrismeScene, PrismeSceneObject } from "@/components/prisme/PrismeScene";
import { StatDisplay, Terminal, PrismeModal, PrismeTitle, errMsg } from "@/components/prisme/Retro";
import "@/components/prisme/prisme.css";

interface SceneData {
  scene_id: number;
  name: string;
  expansion_level: number;
  object_count: number;
  free_count: number;
  occupied_count: number;
  chats_created: number;
  requests_total: number;
  svg: string;
  objects: PrismeSceneObject[];
  my_object: { slot: number; object_id: number; chat_id: number; kind: string } | null;
}

export default function PrismePage() {
  const router = useRouter();
  const [scene, setScene] = useState<SceneData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [selected, setSelected] = useState<PrismeSceneObject | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [createdChat, setCreatedChat] = useState<{
    chat_id: number; slot: number; key: string; kind: string;
  } | null>(null);

  const [reqOpen, setReqOpen] = useState(false);
  const [reqMsg, setReqMsg] = useState("");
  const [reqSending, setReqSending] = useState(false);
  const [reqSent, setReqSent] = useState(false);

  // Вход в существующий чат по объекту-ключу (второй участник)
  const [joinTarget, setJoinTarget] = useState<PrismeSceneObject | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinedChat, setJoinedChat] = useState<{
    chat_id: number; slot: number; key: string; kind: string; already_member: boolean;
  } | null>(null);
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      if (!token) return router.push("/login");
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

  const handleSelect = (obj: PrismeSceneObject) => {
    setConfirmError("");
    setCreatedChat(null);
    setSelected(obj);
  };

  const confirmCreate = async () => {
    if (!selected) return;
    setCreating(true);
    setConfirmError("");
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ object_id: selected.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(errMsg(data, "Не удалось создать чат"));
        load();
        return;
      }
      setCreatedChat({ chat_id: data.chat_id, slot: data.slot, key: data.key, kind: data.kind });
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

  // Клик по ЗАНЯТОМУ объекту — это попытка входа в чат по его ключу
  const handleSelectOccupied = (obj: PrismeSceneObject) => {
    setConfirmError("");
    setJoinedChat(null);
    setJoinTarget(obj);
  };

  const doJoin = async () => {
    if (!joinTarget) return;
    setJoining(true);
    setConfirmError("");
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/chat/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slot: joinTarget.slot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(errMsg(data, "Не удалось присоединиться к чату"));
        load();
        return;
      }
      setJoinedChat({
        chat_id: data.chat_id,
        slot: data.slot,
        key: data.key,
        kind: data.kind,
        already_member: !!data.already_member,
      });
      setJoinTarget(null);
      load();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setJoining(false);
    }
  };

  const copyInvite = async (slot: number) => {
    const url = `${window.location.origin}/prisme?slot=${slot}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(`#${slot}`);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      window.prompt("Скопируйте ссылку-ключ:", url);
    }
  };

  // Автоподхват ссылки-приглашения вида /prisme?slot=N
  useEffect(() => {
    if (!scene) return;
    const raw = new URLSearchParams(window.location.search).get("slot");
    if (raw == null) return;
    const slotN = Number(raw);
    window.history.replaceState({}, "", "/prisme");
    // setState — вне синхронной фазы эффекта (требование react-hooks)
    Promise.resolve().then(() => {
      const obj = scene.objects.find((o) => o.slot === slotN);
      if (obj && obj.status === "occupied" && !obj.i_am_member) {
        setJoinTarget(obj);
      }
    });
  }, [scene]);

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
              <p className="prv-sub text-sm">НЕОНОВЫЙ КЛЮЧ ДОСТУПА К НОВОМУ ЧАТУ</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="prv-chip"><span className="prv-dot free" /> свободно {scene ? scene.free_count : "—"}</span>
            <span className="prv-chip"><span className="prv-dot busy" /> занято {scene ? scene.occupied_count : "—"}</span>
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
            <StatDisplay label="Заявок всего" value={scene.requests_total} color="pink" />
            <StatDisplay label="Объектов" value={scene.object_count} color="purple" />
            <StatDisplay label="Расширений" value={scene.expansion_level} color="yellow" />
          </section>
        )}

        {/* Баннер «всё занято» */}
        {scene && scene.free_count === 0 && (
          <div className="mb-6">
            <Terminal tone="red">
              <span className="text-sm">ИЗОБРАЖЕНИЕ ЗАНЯТО. ВАША ЗАЯВКА ОСТАВЛЕНА. АДМИНИСТРАТОР БУДЕТ УВЕДОМЛЁН.</span>
              <div className="mt-3">
                <button className="prv-btn prv-btn--lime text-sm" onClick={() => setReqOpen(true)}>
                  <Plus size={16} /> Оставить заявку на расширение
                </button>
              </div>
            </Terminal>
          </div>
        )}

        {/* Мой активный ключ */}
        {scene && scene.my_object && (
          <div className="mb-6">
            <div className="prv-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Unlock className="text-[#39FF14]" size={28} />
                <div>
                  <div className="prv-sub">ВАШ КЛЮЧ-ОБЪЕКТ</div>
                  <div className="prv-heading text-lg prv-glow-lime">
                    # {String(scene.my_object.slot).padStart(2, "0")} · {scene.my_object.kind.toUpperCase()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="prv-btn prv-btn--ghost text-sm"
                  onClick={() => copyInvite(scene.my_object!.slot)}
                  title="Скопировать ссылку-ключ для второго участника"
                >
                  <Copy size={14} />
                  {copied === `#${scene.my_object.slot}` ? "Скопировано!" : "Ссылка-ключ"}
                </button>
                <Link className="prv-btn prv-btn--lime" href={`/messages/${scene.my_object.chat_id}`}>
                  Открыть чат
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Загрузка / ошибка */}
        {loading && !scene && (
          <div className="prv-card p-10 text-center prv-sub">ЗАГРУЗКА СЦЕНЫ<span className="prv-cursor" /></div>
        )}
        {error && !loading && (
          <div className="prv-card p-6"><Terminal tone="red">{error}</Terminal></div>
        )}

        {/* Картинка */}
        {scene && (
          <section className="prv-card p-2 sm:p-3 mb-6">
            <PrismeScene
              svg={scene.svg}
              objects={scene.objects}
              selectedSlot={selected?.slot}
              onSelect={handleSelect}
              onSelectOccupied={handleSelectOccupied}
              hint="Свободный объект — создать чат · Занятый — войти по ключу"
            />
            <p className="prv-sub text-xs px-2 pt-2 pb-1 text-center">
              СВОБОДНЫЙ ОБЪЕКТ — СОЗДАТЬ СВОЙ ЧАТ · КЛИК ПО ЗАНЯТОМУ — ВОЙТИ В ЧАТ ПО ЕГО КЛЮЧУ
            </p>
          </section>
        )}

        {/* Подтверждение выбора */}
        <PrismeModal open={!!selected} onClose={() => setSelected(null)} title="Подтверди ключ">
          {selected && (
            <div className="space-y-4">
              <div className="prv-terminal" style={{ borderColor: "#00F5FF8c", color: "#00F5FF" }}>
                ВАШ ВЫБОР: <b>#{selected.slot}</b> · {selected.label}
                <pre className="mt-2 text-xs opacity-80">{`slot=${selected.slot} kind=${selected.kind}`}</pre>
              </div>
              {confirmError && <Terminal tone="red">{confirmError}</Terminal>}
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setSelected(null)} disabled={creating}>
                  Отмена
                </button>
                <button className="prv-btn flex-1" onClick={confirmCreate} disabled={creating}>
                  {creating ? "Создание..." : "Создать чат"}
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
                Чат создан. Ваш ключ: <b>#{createdChat.key}</b> · объект {createdChat.kind}.
              </Terminal>
              <div className="flex gap-3 flex-wrap">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setCreatedChat(null)}>Закрыть</button>
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => copyInvite(createdChat.slot)}>
                  <Copy size={14} /> {copied === `#${createdChat.slot}` ? "Готово!" : "Ссылка-ключ"}
                </button>
                <Link className="prv-btn flex-1 justify-center" href={`/messages/${createdChat.chat_id}`}>
                  Перейти в чат
                </Link>
              </div>
              <p className="prv-sub text-xs">Передайте ссылку-ключ второму участнику — он кликнет по этому же объекту и попадёт в чат.</p>
            </div>
          )}
        </PrismeModal>

        {/* Вход по ключу (клик по занятому объекту) */}
        <PrismeModal open={!!joinTarget} onClose={() => setJoinTarget(null)} title="Вход по ключу">
          {joinTarget && (
            <div className="space-y-4">
              <div className="prv-terminal" style={{ borderColor: "#FFE6008c", color: "#FFE600" }}>
                <KeyRound size={14} className="inline mr-1" />
                ОБЪЕКТ <b>#{joinTarget.slot}</b> · {joinTarget.label}
                {joinTarget.owner_username ? ` · владелец @${joinTarget.owner_username}` : ""}
                {" "}— это ключ существующего чата.
              </div>
              {joinTarget.i_am_member ? (
                <p className="prv-sub text-sm">Вы уже участник этого чата.</p>
              ) : (
                <p className="prv-sub text-sm">Присоединиться к чату владельца этого объекта-ключа?</p>
              )}
              {confirmError && <Terminal tone="red">{confirmError}</Terminal>}
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setJoinTarget(null)} disabled={joining}>
                  Отмена
                </button>
                {joinTarget.i_am_member && joinTarget.chat_id ? (
                  <Link className="prv-btn flex-1 justify-center" href={`/messages/${joinTarget.chat_id}`}>
                    Открыть чат
                  </Link>
                ) : (
                  <button className="prv-btn prv-btn--lime flex-1" onClick={doJoin} disabled={joining}>
                    <LogIn size={15} /> {joining ? "Вход..." : "Войти по ключу"}
                  </button>
                )}
              </div>
            </div>
          )}
        </PrismeModal>

        {/* Успешный вход по ключу */}
        <PrismeModal
          open={!!joinedChat}
          onClose={() => setJoinedChat(null)}
          title={joinedChat?.already_member ? "Вы уже участник" : "Ключ принят"}
        >
          {joinedChat && (
            <div className="space-y-4">
              <Terminal tone="cyan">
                {joinedChat.already_member
                  ? "Вы уже в этом чате."
                  : "Вы присоединились к чату по ключу"}{" "}
                <b>#{joinedChat.key}</b> · объект {joinedChat.kind}.
              </Terminal>
              <div className="flex gap-3">
                <button className="prv-btn prv-btn--ghost flex-1" onClick={() => setJoinedChat(null)}>Закрыть</button>
                <Link className="prv-btn flex-1 justify-center" href={`/messages/${joinedChat.chat_id}`}>
                  Перейти в чат
                </Link>
              </div>
            </div>
          )}
        </PrismeModal>

        {/* Заявка */}
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
              <p className="prv-sub text-sm">Все объекты заняты. Оставьте заявку — мы расширим картинку новыми объектами.</p>
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
