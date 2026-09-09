"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, Smile, Clapperboard, X, Mic, Square, Trash2, Type, Lock } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { mediaUrl } from "@/lib/media";
import { Avatar } from "@/components/Avatar";
import { AudioPlayer } from "@/components/AudioPlayer";
import { RichEditor, RichEditorHandle } from "@/components/RichEditor";
import { useDraft } from "@/src/hooks/useDraft";
import { useI18n } from "@/lib/i18n/LanguageProvider";

const MAX_RECORD_SECONDS = 180;

export function CreatePost() {
  const [text, setText, clearDraft] = useDraft("draft_create_post", "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const [user, setUser] = useState<{
    id: number;
    display_name: string;
    avatar_url?: string | null;
    level?: number;
    is_admin?: boolean;
    is_moderator?: boolean;
  } | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerPacks, setStickerPacks] = useState<any[]>([]);
  const [activePackTab, setActivePackTab] = useState<number>(0);
  const [error, setError] = useState("");
  
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichEditorHandle>(null);
  const router = useRouter();
  const { t } = useI18n();



  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const token = getToken();
    if (token) {
      setLogged(true);
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then(setUser);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const canUploadAudio = user && ((user.level ?? 1) >= 2 || user.is_admin || user.is_moderator);

  function onFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setError("");
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!cancelledRef.current && chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
          const ext = mimeType.includes("mp4") ? "m4a" : "webm";
          const audioFile = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
          onFile(audioFile);
        }
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordTime(0);

      timerRef.current = setInterval(() => {
        setRecordTime((t) => {
          if (t + 1 >= MAX_RECORD_SECONDS) {
            stopRecording();
            return t;
          }
          return t + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Mic error:", err);
      setError(t("compose.micDenied"));
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  function cancelRecording() {
    cancelledRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
    setRecordTime(0);
  }

  // ---------- 🎨 Стикеры: та же прогрузка паков, что в чатах/реакциях ----------
  async function loadStickerPacks() {
    if (stickerPacks.length) return;
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sticker-packs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStickerPacks(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to load sticker packs:", e);
    }
  }

  // Загружаем паки при открытии пикера стикеров
  useEffect(() => {
    if (showStickers) loadStickerPacks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStickers]);

  function insertSticker(emojiChar: string) {
    setText((prev) => prev + " " + emojiChar + " ");
    setShowStickers(false);
  }

  function insertStickerImage(content: string) {
    const url = mediaUrl(content);
    setText((prev) => prev + " ![sticker](" + url + ") ");
    setShowStickers(false);
  }

  async function submit() {
    setError("");
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!text.trim() && !file) {
      setError(t("compose.needTextOrMedia"));
      return;
    }

    const form = new FormData();
    form.append("text", text);
    if (file) form.append("file", file);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.status === 429) {
      setError(t("compose.rateLimit"));
      return;
    }
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.detail ?? t("compose.publishError"));
      return;
    }

    setText("");
    clearDraft();
    onFile(null);
    if (fileRef.current) fileRef.current.value = "";
    triggerFeedRefresh();
  }

  if (!logged) {
    return (
      <div className="p-4 border-b border-line dark:border-white/10">
        <Link href="/login" className="block text-center border border-line dark:border-white/20 rounded-xl py-3 font-bold text-gray-800 dark:text-white/80 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all">
          {t("compose.loginToPost")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-line dark:border-white/10">
      <div className="flex gap-3">
        <Avatar src={user?.avatar_url} name={user?.display_name || "?"} id={user?.id} />
        <div className="flex-1">
 {/* ✅ ПОЛЕ ВВОДА (только RichEditor внутри рамки) */}
<div className="chat-input-shell rounded-xl border border-line dark:border-white/15 bg-gray-100 dark:bg-white/5 overflow-hidden focus-within:border-[#8b5cf6] transition-all">
  <RichEditor
    ref={editorRef}
    value={text}
    onChange={(v) => setText(v)}
    placeholder={t("compose.placeholder")}
    className="w-full bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 p-3 min-h-[76px] max-h-60 overflow-y-auto text-sm"
  />
</div>

{/* ✅ ПРЕВЬЮ И КНОПКИ ВЫНЕСЕНЫ НАРУЖУ (ниже поля ввода) */}
{preview && file && (
  <div className="relative mt-2 max-w-full">
    {file.type.startsWith("audio/") ? (
      <div className="pr-8"><AudioPlayer src={preview} /></div>
    ) : file.type.startsWith("video/") ? (
      <video src={preview} controls className="max-h-48 rounded-xl border border-line dark:border-white/20" />
    ) : (
      <img src={preview} alt="" className="max-h-48 rounded-xl border border-line dark:border-white/20" />
    )}
    <button
      onClick={() => onFile(null)}
      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:scale-110 transition-transform shadow-lg"
    >
      <X size={14} />
    </button>
  </div>
)}

<input
  ref={fileRef}
  type="file"
  accept="image/*,video/*"
  className="hidden"
  onChange={(e) => {
    onFile(e.target.files?.[0] ?? null);
    e.target.value = "";
  }}
/>

{error && (
  <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold">
    {error}
  </div>
)}

{recording ? (
  <div className="flex items-center justify-between mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
    <div className="flex items-center gap-3">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-600 dark:bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
      </span>
      <span className="text-red-600 dark:text-red-400 font-mono font-bold">{formatTime(recordTime)}</span>
      <div className="flex items-end gap-[3px] h-7">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className="voice-bar w-[3px] bg-red-600 dark:bg-red-400 rounded-full" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
    <div className="flex items-center gap-2">
      <button onClick={cancelRecording} className="p-2 rounded-lg text-gray-500 dark:text-white/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all" title={t("compose.cancelRec")}>
        <Trash2 size={20} />
      </button>
      <button onClick={stopRecording} className="flex items-center gap-2 bg-red-500 text-white rounded-lg px-4 py-2 font-semibold hover:bg-red-600 transition-all">
        <Square size={16} fill="currentColor" /> {t("compose.stop")}
      </button>
    </div>
  </div>
) : (
  <div className="flex items-center justify-between mt-3">
    <div className="flex gap-3 relative">
      <button className="text-gray-600 dark:text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()} title={t("compose.photoGif")}>
        <ImageIcon size={20} />
      </button>
      <button className="text-gray-600 dark:text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()} title={t("compose.video")}>
        <Clapperboard size={20} />
      </button>
      {canUploadAudio && (
        <button className="text-gray-600 dark:text-white/60 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors" onClick={startRecording} title={t("compose.voice")}>
          <Mic size={20} />
        </button>
      )}
      <button
        type="button"
        className="transition-colors text-gray-600 dark:text-white/60 hover:text-[#8b5cf6]"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          editorRef.current?.openMenuAt(rect.left + rect.width / 2, rect.top - 8);
        }}
        title={t("compose.formatting")}
      >
        <Type size={20} />
      </button>
      <button className={`transition-colors ${showStickers ? "text-[#8b5cf6]" : "text-gray-600 dark:text-white/60 hover:text-[#8b5cf6]"}`} onClick={() => setShowStickers(!showStickers)}>
        <Smile size={20} />
      </button>
      {showStickers && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowStickers(false)} />
          <div className="absolute top-full left-0 mt-2 border border-line dark:border-white/20 rounded-xl bg-ivory dark:bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl z-50 w-72 max-h-80 flex flex-col overflow-hidden">
            {/* Вкладки паков — как в чатах */}
            <div className="shrink-0 p-2 pb-1 border-b border-line dark:border-white/10">
              <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
                {stickerPacks.map((pack: any, i: number) => (
                  <button
                    key={pack.id ?? i}
                    type="button"
                    onClick={() => setActivePackTab(i)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-all ${
                      activePackTab === i
                        ? "bg-[#8b5cf6] text-white"
                        : "bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/10"
                    }`}
                  >
                    {pack.locked && <Lock size={10} className="text-yellow-600 dark:text-yellow-400" />}
                    {pack.name}
                  </button>
                ))}
                {stickerPacks.length === 0 && (
                  <span className="text-[11px] text-gray-500 dark:text-white/40 px-1 py-1.5">Стикеры недоступны</span>
                )}
              </div>
            </div>

            {/* Контент пака — скроллится */}
            <div className="flex-1 overflow-y-auto p-2 min-h-0">
              {stickerPacks[activePackTab] ? (
                stickerPacks[activePackTab].locked ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center">
                      <Lock size={18} className="text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Пак заблокирован</p>
                    <p className="text-[11px] text-gray-500 dark:text-white/40 max-w-[220px]">
                      Доступен с уровня {stickerPacks[activePackTab].min_level}.
                      Повысь уровень, чтобы использовать эти стикеры.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-1.5">
                    {(stickerPacks[activePackTab].stickers || []).map((s: any) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          // ✅ Как в чатах: эмодзи → текст, картинка → вставка изображения
                          if (s.type === "emoji") insertSticker(s.content);
                          else insertStickerImage(s.content);
                        }}
                        className="aspect-square flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all"
                        title={s.type === "emoji" ? s.content : ""}
                      >
                        {s.type === "emoji" ? (
                          <span className="text-2xl">{s.content}</span>
                        ) : (
                          <img src={mediaUrl(s.content)} alt="" className="w-9 h-9 object-contain" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="py-6 text-center text-xs text-gray-500 dark:text-white/40">
                  {stickerPacks.length === 0 ? "Паки не найдены" : "Выберите пак"}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    <button
      onClick={submit}
      disabled={!text.trim() && !file}
      className="bg-[#8b5cf6] text-white font-medium rounded-lg px-3.5 py-1.5 text-sm sm:px-5 sm:py-2 sm:text-base transition-all hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {t("compose.publish")}
    </button>
  </div>
)}

        </div>
      </div>
      <style jsx>{`
        .voice-bar {
          height: 8px;
          animation: voiceWave 1s ease-in-out infinite;
        }
        @keyframes voiceWave {
          0%, 100% { height: 8px; }
          50% { height: 26px; }
        }
      `}</style>
    </div>
  );
}