"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Plus, Database, Inbox } from "lucide-react";
import { getToken } from "@/lib/auth";
import dynamic from "next/dynamic";
import type { PrismeSceneObject } from "@/components/prisme/PrismeScene";

// 🚀 3D/WebGL-сцена — ленивая загрузка
const PrismeScene = dynamic(() => import("@/components/prisme/PrismeScene").then(m => m.PrismeScene), {
  ssr: false,
  loading: () => <div className="p-8 text-center text-sm opacity-60">🎨 Загрузка сцены…</div>,
});
import { StatDisplay, Terminal, PrismeTitle, errMsg } from "@/components/prisme/Retro";
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
  my_object: null;
}

interface AdminObject extends PrismeSceneObject {
  owner_username?: string | null;
  owner_display_name?: string | null;
  chat_name?: string | null;
  added_at: number;
  chat_id?: number | null;
}

interface ReqItem {
  id: number;
  user_id: number;
  username: string | null;
  display_name: string | null;
  message: string | null;
  status: "pending" | "granted" | "dismissed";
  created_at: string | null;
}

type TabId = "image" | "objects" | "requests";

interface StatsData {
  chats_created: number;
  requests_total: number;
  object_count: number;
  base_count: number;
  free_count: number;
  occupied_count: number;
  expansion_level: number;
  pending_requests?: number;
  objects_by_expansion?: Record<string, number>;
}

export default function AdminPrismePage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [scene, setScene] = useState<SceneData | null>(null);
  const [objects, setObjects] = useState<AdminObject[]>([]);
  const [requests, setRequests] = useState<ReqItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<TabId>("image");
  const [selObject, setSelObject] = useState<AdminObject | null>(null);
  const [filter, setFilter] = useState<"all" | "free" | "occupied">("all");
  const [expandCount, setExpandCount] = useState(6);
  const [expandMsg, setExpandMsg] = useState("");

  const loadAll = useCallback(async () => {
    const token = getToken();
    if (!token) return router.push("/login");
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers });
      const meData = await meRes.json();
      if (!meData.is_admin) { setForbidden(true); setLoading(false); return; }

      const [sceneRes, objRes, reqRes, statRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/scene`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/objects`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/requests`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/stats`, { headers }),
      ]);
      if (sceneRes.ok) setScene(await sceneRes.json());
      if (objRes.ok) setObjects(await objRes.json());
      if (reqRes.ok) setRequests(await reqRes.json());
      if (statRes.ok) setStats(await statRes.json());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { Promise.resolve().then(loadAll); }, [loadAll]);

  const doExpand = async () => {
    setBusy(true);
    setExpandMsg("");
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/expand`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ count: expandCount }),
      });
      if (!res.ok) {
        const d = await res.json();
        setExpandMsg(errMsg(d, "Ошибка расширения"));
        return;
      }
      const data = await res.json();
      setScene(data);
      setExpandMsg(`Картинка расширена на ${data.expanded_by} объектов`);
      loadAll();
    } catch {
      setExpandMsg("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  const resolveReq = async (id: number, action: "grant" | "dismiss") => {
    const token = getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/prisme/requests/${id}/resolve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) loadAll();
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const shownObjects = objects.filter((o) =>
    filter === "all" ? true : filter === "free" ? o.status === "free" : o.status === "occupied"
  );

  if (forbidden) {
    return (
      <div className="prv-root prv-crt min-h-screen flex items-center justify-center p-6">
        <div className="prv-card p-8 max-w-md w-full">
          <Terminal tone="red">Доступ только для администраторов.</Terminal>
          <button className="prv-btn prv-btn--ghost mt-4 w-full" onClick={() => router.push("/")}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="prv-root prv-crt min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Шапка */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button className="prv-btn prv-btn--ghost px-3" onClick={() => router.push("/adminnew")} aria-label="Назад">
              <ArrowLeft size={18} />
            </button>
            <div>
              <PrismeTitle>PRISME // ADMIN</PrismeTitle>
              <p className="prv-sub text-sm">УПРАВЛЕНИЕ КАРТИНКОЙ И ОЧЕРЕДЬЮ ЗАЯВОК</p>
            </div>
          </div>
          <button className="prv-btn prv-btn--ghost px-3" onClick={loadAll} aria-label="Обновить">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </header>

        {/* Статистика — ретро-дисплеи */}
        {scene && (
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatDisplay label="Чатов создано" value={scene.chats_created} color="cyan" hint="Создано чатов через выбор объекта" />
            <StatDisplay label="Заявок всего" value={scene.requests_total} color="pink" hint="Всего заявок на расширение" />
            <StatDisplay label="В очереди" value={pendingCount} color="yellow" hint="Заявки со статусом pending" />
            <StatDisplay label="Свободно" value={scene.free_count} color="lime" />
            <StatDisplay label="Занято" value={scene.occupied_count} color="purple" />
            <StatDisplay label="Объектов / расшир." value={`${scene.object_count}/${scene.expansion_level}`} color="cyan" />
          </section>
        )}

        {/* Вкладки */}
        <nav className="flex gap-2 mb-5 flex-wrap">
          {([
            ["image", "Картинка"],
            ["objects", `Объекты (${objects.length})`],
            ["requests", `Заявки${pendingCount ? ` ● ${pendingCount}` : ""}`],
          ] as [TabId, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`prv-btn py-2 text-sm ${tab === id ? "" : "prv-btn--ghost"}`}
              style={tab === id && id === "requests" && pendingCount > 0
                ? { borderColor: "#FFE600", color: "#FFE600", boxShadow: "0 0 18px rgba(255,230,0,.35)" }
                : undefined}
            >
              {id === "image" && <Database size={14} />}
              {id === "requests" && <Inbox size={14} />}
              {label}
            </button>
          ))}
        </nav>

{/* ВКЛАДКА: КАРТИНКА */}
        {tab === "image" && scene && (
          <div className="grid lg:grid-cols-3 gap-4">
            <section className="prv-card p-2 sm:p-3 lg:col-span-2">
              <PrismeScene
                svg={scene.svg}
                objects={objects}
                selectedSlot={selObject?.slot ?? null}
                allowOccupiedClick
                onSelect={(o) => setSelObject(objects.find((x) => x.slot === o.slot) || null)}
                hint="Кликните любой объект для деталей"
              />
              <p className="prv-sub text-xs px-2 pt-2 pb-1 text-center">
                СГЕНЕРИРОВАННАЯ КАРТИНКА · СВОБОДНЫЕ СВЕТЯТСЯ ЗЕЛЁНЫМ/ГОЛУБЫМ, ЗАНЯТЫЕ ЗАТЕМНЕНЫ С ЗАМКОМ
              </p>
            </section>

            <aside className="space-y-4">
              {/* Расширение картинки */}
              <div className="prv-card p-5">
                <h3 className="prv-heading text-base prv-glow-purple mb-1">Расширить картинку</h3>
                <p className="prv-sub text-xs mb-4">Добавляет новые свободные объекты. Занятые остаются на своих местах.</p>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={expandCount}
                    onChange={(e) => setExpandCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                    className="prv-input w-24 text-center"
                  />
                  <button className="prv-btn prv-btn--purple flex-1" onClick={doExpand} disabled={busy}>
                    <Plus size={15} /> {busy ? "Расширение..." : "Расширить"}
                  </button>
                </div>
                {expandMsg && (
                  <Terminal tone={expandMsg.startsWith("Картинка") ? "cyan" : "red"}>{expandMsg}</Terminal>
                )}
                {stats?.objects_by_expansion && (
                  <div className="mt-4">
                    <div className="prv-stat-label mb-1">Объектов по уровням расширения</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.objects_by_expansion as Record<string, number>).map(([lvl, n]) => (
                        <span key={lvl} className="prv-chip">
                          L{lvl}: <b style={{ color: "#00F5FF" }}>{n}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Детали выбранного объекта */}
              <div className="prv-card p-5">
                <h3 className="prv-heading text-base prv-glow-cyan mb-3">Объект</h3>
                {selObject ? (
                  <dl className="text-sm space-y-2 font-mono" style={{ color: "#cfd6ea" }}>
                    <div className="flex justify-between"><dt className="opacity-60">slot</dt><dd>#{selObject.slot}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-60">тип</dt><dd>{selObject.label}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-60">статус</dt>
                      <dd><span className={`prv-badge ${selObject.status}`}>{selObject.status === "free" ? "свободен" : "занят"}</span></dd></div>
                    <div className="flex justify-between"><dt className="opacity-60">владелец</dt>
                      <dd>{selObject.owner_username ? `@${selObject.owner_username}` : "—"}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-60">чат</dt>
                      <dd>{selObject.chat_id ? `#${selObject.chat_id}${selObject.chat_name ? ` · ${selObject.chat_name}` : ""}` : "—"}</dd></div>
                    <div className="flex justify-between"><dt className="opacity-60">добавлен</dt>
                      <dd>{selObject.added_at === 0 ? "базовый" : `расширение L${selObject.added_at}`}</dd></div>
                  </dl>
                ) : (
                  <p className="prv-sub text-sm">Кликните объект на картинке слева.</p>
                )}
              </div>
            </aside>
          </div>
        )}

{/* ВКЛАДКА: ОБЪЕКТЫ */}
        {tab === "objects" && (
          <section className="prv-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="prv-heading text-base prv-glow-lime">Все объекты картинки</h3>
              <div className="flex gap-2">
                {(["all", "free", "occupied"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`prv-btn py-1.5 text-xs ${filter === f ? "" : "prv-btn--ghost"}`}
                  >
                    {f === "all" ? "все" : f === "free" ? "свободные" : "занятые"}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="text-left opacity-60 border-b border-white/10">
                    <th className="py-2 pr-4">SLOT</th>
                    <th className="py-2 pr-4">ТИП</th>
                    <th className="py-2 pr-4">СТАТУС</th>
                    <th className="py-2 pr-4">ВЛАДЕЛЕЦ</th>
                    <th className="py-2 pr-4">ЧАТ</th>
                    <th className="py-2">УРОВЕНЬ</th>
                  </tr>
                </thead>
                <tbody>
                  {shownObjects.map((o) => (
                    <tr
                      key={o.slot}
                      onClick={() => { setTab("image"); setSelObject(o); }}
                      className="border-b border-white/5 hover:bg-[#00F5FF]/5 cursor-pointer transition-colors"
                    >
                      <td className="py-2 pr-4" style={{ color: "#00F5FF" }}>#{String(o.slot).padStart(2, "0")}</td>
                      <td className="py-2 pr-4">{o.label}</td>
                      <td className="py-2 pr-4">
                        <span className={`prv-badge ${o.status}`}>{o.status === "free" ? "свободен" : "занят"}</span>
                      </td>
                      <td className="py-2 pr-4">{o.owner_username ? `@${o.owner_username}` : "—"}</td>
                      <td className="py-2 pr-4">{o.chat_id ? `#${o.chat_id}` : "—"}</td>
                      <td className="py-2">{o.added_at === 0 ? "базовый" : `L${o.added_at}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shownObjects.length === 0 && (
                <p className="prv-sub text-sm py-6 text-center">Нет объектов под фильтр.</p>
              )}
            </div>
          </section>
        )}

        {/* ВКЛАДКА: ЗАЯВКИ */}
        {tab === "requests" && (
          <section className="prv-card p-4">
            <h3 className="prv-heading text-base prv-glow-yellow mb-4">Очередь заявок</h3>
            <div className="space-y-3">
              {requests.length === 0 && (
                <p className="prv-sub text-sm py-6 text-center">Заявок пока нет.</p>
              )}
              {requests.map((r) => (
                <div key={r.id} className="prv-card prv-card-tight p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm">
                      <b style={{ color: "#00F5FF" }}>@{r.username || r.user_id}</b>
                      {r.display_name && <span className="opacity-70"> · {r.display_name}</span>}
                      <span className="opacity-50 ml-2">{r.created_at?.slice(0, 16).replace("T", " ")}</span>
                    </div>
                    {r.message && (
                      <p className="prv-sub text-xs mt-1 max-w-xl">«{r.message}»</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`prv-badge ${r.status}`}>
                      {r.status === "pending" ? "в очереди" : r.status === "granted" ? "одобрена" : "отклонена"}
                    </span>
                    {r.status === "pending" && (
                      <>
                        <button className="prv-btn prv-btn--lime py-1.5 text-xs" onClick={() => resolveReq(r.id, "grant")}>
                          Одобрить
                        </button>
                        <button className="prv-btn prv-btn--pink py-1.5 text-xs" onClick={() => resolveReq(r.id, "dismiss")}>
                          Отклонить
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="prv-sub text-xs mt-4">
              Совет: после одобрения заявки расширьте картинку — пользователь сможет выбрать свободный объект.
            </p>
          </section>
        )}

        <div className="prv-zigzag mt-10" />
        <footer className="mt-4 text-center prv-sub text-xs">PRISME//ADMIN · retro-futurism console</footer>
      </div>
    </div>
  );
}