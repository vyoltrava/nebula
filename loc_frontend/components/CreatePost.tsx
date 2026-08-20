"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, Smile, Clapperboard, X, Mic, Square, Trash2, Type } from "lucide-react";
import { getToken } from "@/lib/auth";
import { triggerFeedRefresh } from "@/lib/events";
import { STICKERS } from "@/lib/stickers";
import { Avatar } from "@/components/Avatar";
import { AudioPlayer } from "@/components/AudioPlayer";
import { MarkdownContextMenu } from "@/components/MarkdownContextMenu";
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
  const [error, setError] = useState("");
  
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { t } = useI18n();

  const [showMarkdownMenu, setShowMarkdownMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

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

  function insertSticker(code: string) {
    setText((prev) => prev + " " + code + " ");
    setShowStickers(false);
  }

  // ✅ ИСПРАВЛЕНО: Берём выделение напрямую из textarea в момент клика, чтобы не зависеть от стейта
  function applyMarkdown(action: "bold" | "italic" | "code" | "link" | "spoiler") {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = text.substring(start, end);

    let before = "", after = "", placeholder = t("compose.mdText");
    switch (action) {
      case "bold": before = "**"; after = "**"; placeholder = t("compose.mdBold"); break;
      case "italic": before = "*"; after = "*"; placeholder = t("compose.mdItalic"); break;
      case "code": before = "`"; after = "`"; placeholder = t("compose.mdCode"); break;
      case "link": before = "["; after = "](https://)"; placeholder = t("compose.mdLink"); break;
      case "spoiler": before = "||"; after = "||"; placeholder = t("compose.mdSpoiler"); break;
    }

    const insertion = selectedText ? `${before}${selectedText}${after}` : `${before}${placeholder}${after}`;
    const newText = text.substring(0, start) + insertion + text.substring(end);
    
    setText(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = selectedText ? start + insertion.length : start + before.length + placeholder.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
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
      <div className="p-4 border-b border-white/10">
        <Link href="/login" className="block text-center border border-white/20 rounded-xl py-3 font-bold text-white/80 hover:bg-white/10 hover:text-white transition-all">
          {t("compose.loginToPost")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-white/10">
      <div className="flex gap-3">
        <Avatar src={user?.avatar_url} name={user?.display_name || "?"} id={user?.id} />
        <div className="flex-1">
          <div className="rounded-xl border border-white/15 bg-white/5 overflow-hidden focus-within:border-[#8b5cf6] focus-within:bg-white/10 transition-all">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("compose.placeholder")}
              rows={3}
              className="w-full resize-none bg-transparent text-white placeholder-white/40 p-3 focus:outline-none"
              onContextMenu={(e) => {
                // На мобильных устройствах игнорируем, там главную роль играет кнопка Type
                if (window.matchMedia("(pointer: coarse)").matches) return; 
                e.preventDefault(); 
                setMenuPosition({ x: e.clientX, y: e.clientY });
                setShowMarkdownMenu(true);
              }}
            />
          </div>

          {/* ✅ УБРАН ДУБЛИКАТ. Теперь меню рендерится только один раз */}
          {showMarkdownMenu && (
            <MarkdownContextMenu
              x={menuPosition.x}
              y={menuPosition.y}
              onClose={() => setShowMarkdownMenu(false)}
              onAction={applyMarkdown}
            />
          )}

          {preview && file && (
            <div className="relative mt-2 max-w-full">
              {file.type.startsWith("audio/") ? (
                <div className="pr-8"><AudioPlayer src={preview} /></div>
              ) : file.type.startsWith("video/") ? (
                <video src={preview} controls className="max-h-48 rounded-xl border border-white/20" />
              ) : (
                <img src={preview} alt="" className="max-h-48 rounded-xl border border-white/20" />
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
            <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}

          {recording ? (
            <div className="flex items-center justify-between mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-red-400 font-mono font-bold">{formatTime(recordTime)}</span>
                <div className="flex items-end gap-[3px] h-7">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <span key={i} className="voice-bar w-[3px] bg-red-400 rounded-full" style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={cancelRecording} className="p-2 rounded-lg text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-all" title={t("compose.cancelRec")}>
                  <Trash2 size={20} />
                </button>
                <button onClick={stopRecording} className="flex items-center gap-2 bg-red-500 text-white rounded-lg px-4 py-2 font-semibold hover:bg-red-600 transition-all">
                  <Square size={16} fill="currentColor" /> {t("compose.stop")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-3 relative">
                <button className="text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()} title={t("compose.photoGif")}>
                  <ImageIcon size={20} />
                </button>
                <button className="text-white/60 hover:text-[#8b5cf6] transition-colors" onClick={() => fileRef.current?.click()} title={t("compose.video")}>
                  <Clapperboard size={20} />
                </button>
                {canUploadAudio && (
                  <button className="text-white/60 hover:text-emerald-400 transition-colors" onClick={startRecording} title={t("compose.voice")}>
                    <Mic size={20} />
                  </button>
                )}
                    {/* 🆕 КНОПКА ФОРМАТИРОВАНИЯ (Решение проблемы с мобилками) */}
    <button 
      type="button"
      onMouseDown={(e) => e.preventDefault()} // ❗️ ВАЖНО: не дает textarea потерять фокус и курсор
      className={`transition-colors ${showMarkdownMenu ? "text-[#8b5cf6]" : "text-white/60 hover:text-[#8b5cf6]"}`} 
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        // Открываем меню чуть выше кнопки
        setMenuPosition({ x: rect.left + rect.width / 2, y: rect.top - 10 }); 
        setShowMarkdownMenu(true);
      }}
      title={t("compose.formatting")}
    >
      <Type size={20} />
    </button>
                <button className={`transition-colors ${showStickers ? "text-[#8b5cf6]" : "text-white/60 hover:text-[#8b5cf6]"}`} onClick={() => setShowStickers(!showStickers)}>
                  <Smile size={20} />
                </button>

                {showStickers && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStickers(false)} />
                    <div className="absolute top-full left-0 mt-2 p-3 border border-white/20 rounded-xl bg-[#1f1f23]/95 backdrop-blur-md shadow-2xl z-50 w-64 max-h-72 overflow-y-auto">
                      <p className="text-xs font-bold text-white/60 mb-2 uppercase tracking-wider sticky top-0 bg-[#1f1f23]/95 pb-1">Стикеры</p>
                      <div className="grid grid-cols-5 gap-1">
                        {STICKERS.map((s) => (
                          <button key={s.code} onClick={() => insertSticker(s.code)} className="text-2xl hover:bg-white/10 rounded-lg p-1.5 transition-colors" title={s.label}>
                            {s.emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={submit}
                disabled={!text.trim() && !file}
                className="bg-[#8b5cf6] text-white font-medium rounded-lg px-5 py-2 transition-all hover:bg-[#7c3aed] disabled:opacity-40 disabled:cursor-not-allowed"
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