"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Radio, Send } from "lucide-react";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { errMsg } from "@/lib/apiError";
import { Terminal } from "@/components/prisme/Retro";
import LinkPreview from "@/components/LinkPreview";
import "@/components/prisme/prisme.css";

interface Msg {
  id: number;
  sender_id: number;
  sender_name?: string | null;
  text?: string | null;
  ciphertext?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
}
interface OtherUser { username: string; display_name: string }
interface ChatInfo {
  id: number;
  name: string | null;
  is_prism: boolean;
  other?: OtherUser | null;
}

const isService = (m: Msg) =>
  m.media_type === "system" ||
  (!!m.text && (m.text.startsWith("__PRISM_GENESIS__") || m.text.startsWith("__PRISME_GENESIS__")));

const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/gi;

/** Превращает URL в тексте сообщения в неоновые кликабельные ссылки. */
function renderWithLinks(text: string) {
  return text.split(URL_SPLIT).map((part, i) =>
    /^https?:\/\//i.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="prv-link"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function firstUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0] : null;
}

export default function PrismeRoomPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = String(params?.id ?? "");

  const [myId, setMyId] = useState<number | null>(null);
  const [info, setInfo] = useState<ChatInfo | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const feedEndRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }, []);

  const fetchMsgs = useCallback(async (): Promise<Msg[] | null> => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
        { headers: authHeaders() },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const arr: Msg[] = Array.isArray(data) ? data : (data.messages ?? []);
      return arr.filter((m) => !isService(m));
    } catch {
      return null;
    }
  }, [chatId, authHeaders]);

  // Первичная загрузка: профиль, инфо о чате, сообщения, отметка «прочитано»
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = getToken();
      if (!token) { router.push("/login"); return; }
      const headers = authHeaders();
      const [meRes, chatRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, { headers }),
      ]);
      if (!chatRes.ok) throw new Error("Чат не найден или недоступен");
      const meData = await meRes.json().catch(() => null);
      setMyId(meData?.id ?? null);
      setInfo(await chatRes.json());
      const arr = await fetchMsgs();
      if (arr) setMsgs(arr);
      // отметка о прочтении — не критично
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/read`, {
        method: "POST", headers,
      }).catch(() => { /* ignore */ });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [chatId, router, authHeaders, fetchMsgs]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);

  // Живая лента: мягкий поллинг каждые 4 секунды
  useEffect(() => {
    if (!chatId) return;
    const iv = setInterval(async () => {
      const arr = await fetchMsgs();
      if (arr) setMsgs(arr);
    }, 4000);
    return () => clearInterval(iv);
  }, [chatId, fetchMsgs]);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append("text", body);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/messages`,
        { method: "POST", headers: authHeaders(), body: form },
      );
      if (!res.ok) {
        let data: unknown = null;
        try { data = await res.json(); } catch { /* ignore */ }
        setError(errMsg(data, "Не удалось отправить сообщение"));
        return;
      }
      setText("");
      if (taRef.current) taRef.current.style.height = "auto";
      const arr = await fetchMsgs();
      if (arr) setMsgs(arr);
    } catch {
      setError("Ошибка сети");
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const title = info?.name || `PRISME CHANNEL #${chatId}`;
  const partner = info?.other;

  if (loading) {
    return (
      <div className="prv-root prv-crt h-screen overflow-hidden flex items-center justify-center">
        <div className="prv-card px-10 py-8 prv-sub">
          ОТКРЫВАЕМ КАНАЛ<span className="prv-cursor" />
        </div>
      </div>
    );
  }

  return (
    <div className="prv-root prv-crt h-screen overflow-hidden flex flex-col">
      <div className="prv-room flex-1 min-h-0">
        {/* Космический фон */}
        <div className="prv-stars" />
        <div className="prv-gridfloor" />

        {/* Шапка канала */}
        <header className="prv-roomhead shrink-0">
          <button
            className="prv-btn prv-btn--ghost px-3"
            onClick={() => router.push("/messages")}
            aria-label="Назад к чатам"
          >
            <ArrowLeft size={18} />
          </button>
          <Radio size={20} className="text-[#00F5FF]" style={{ filter: "drop-shadow(0 0 6px #00F5FF)" }} />
          <div className="min-w-0">
            <h1 className="prv-heading text-lg sm:text-xl truncate prv-chromatic" data-text={title}>
              {title}
            </h1>
            <p className="prv-channel-note truncate">
              {partner ? `@${partner.username}` : "приватный канал"}
              {" · "}канал активен{" · "}
              <span style={{ color: "#39FF14" }}>●</span> SECURE LINK
            </p>
          </div>
          <Link
            href="/prisme"
            className="prv-btn prv-btn--ghost ml-auto py-1.5 px-3 text-xs shrink-0"
          >
            Карта ключей
          </Link>
        </header>

        {/* Лента сообщений */}
        <main className="prv-feed">
          {error && <Terminal tone="red">{error}</Terminal>}

          {msgs.length === 0 && !error && (
            <div className="m-auto text-center">
              <p className="prv-heading text-xl prv-glow-purple mb-2">КАНАЛ ОТКРЫТ</p>
              <p className="prv-sub text-sm">
                Двое — два ключа — один эфир.<span className="prv-cursor" />
              </p>
            </div>
          )}

          {msgs.map((m) => {
            const mine = myId != null && m.sender_id === myId;
            const body = m.text || "";
            return (
              <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                {!mine && (
                  <span className="prv-meta mb-0.5 ml-1">{m.sender_name || "unknown"}</span>
                )}
                <div className={`prv-bubble ${mine ? "prv-bubble-me" : "prv-bubble-they"}`}>
                  {renderWithLinks(body)}
                  <div className={`prv-meta flex items-center gap-1 ${mine ? "justify-end" : ""}`}>
                    {fmtTime(m.created_at)}
                    {mine && <span style={{ color: "#00F5FF" }}>◆</span>}
                  </div>
                </div>
                {firstUrl(body) && (
                  <div className={`${mine ? "self-end" : "self-start"} w-[86%] max-w-full`}>
                    <LinkPreview url={firstUrl(body)!} />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </main>

        {/* Панель ввода */}
        <footer className="prv-roominput shrink-0">
          <textarea
            ref={taRef}
            className="prv-input flex-1 resize-none"
            rows={1}
            placeholder="Передайте сигнал в эфир…"
            value={text}
            disabled={sending}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="prv-sendbtn"
            onClick={send}
            disabled={sending || !text.trim()}
            aria-label="Отправить"
            title="Отправить (Enter)"
          >
            <Send size={20} />
          </button>
        </footer>
      </div>
    </div>
  );
}