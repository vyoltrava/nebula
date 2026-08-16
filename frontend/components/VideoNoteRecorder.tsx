"use client";
import { useRef, useState, useEffect } from "react";
import { Square, X, Minimize2, Maximize2, SwitchCamera } from "lucide-react";

interface Props {
  mode: 'expanded' | 'minimized';
  onRecorded: (file: File) => void;
  onCancel: () => void;
  onMinimize: () => void;
  onExpand?: () => void;
  onDenied?: () => void;
  maxDuration?: number;
}

const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const SIZE = IS_MOBILE ? 480 : 720;
const REC_FPS = IS_MOBILE ? 24 : 30;
const BITRATE = IS_MOBILE ? 800_000 : 2_500_000;

export function VideoNoteRecorder({
  mode = 'expanded',
  onRecorded,
  onCancel,
  onMinimize,
  onExpand,
  onDenied,
  maxDuration = 60,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTsRef = useRef(0);
  const rafRef = useRef<number>(0);
  const mimeRef = useRef<string>("video/webm");
  const mirroredRef = useRef(true);
  const canvasTrackRef = useRef<MediaStreamTrack | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mirrored, setMirrored] = useState(true);
  const [hasFlip, setHasFlip] = useState(false);

  useEffect(() => { mirroredRef.current = mirrored; }, [mirrored]);

  useEffect(() => {
    startAll();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    const s = videoStreamRef.current;
    if (v && s) {
      v.srcObject = s;
      v.play().catch(() => {});
    }
  }, [mode, isReady]);

  async function startCamera(facingMode: "user" | "environment" = "user") {
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facingMode,
        width: { ideal: SIZE },
        height: { ideal: SIZE },
      },
    });
    videoStreamRef.current = stream;
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream;
      await v.play().catch(() => {});
    }
  }

  async function startMic() {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioStreamRef.current = stream;
  }

  async function startAll() {
    try {
      await startMic();
      await startCamera("user");
      const devs = await navigator.mediaDevices.enumerateDevices();
      setHasFlip(devs.filter((d) => d.kind === "videoinput").length > 1);
      setIsReady(true);
      runLoop();
    } catch (e: any) {
      if (e?.message === "camera_denied" || e?.message === "mic_denied") {
        onDenied ? onDenied() : alert("Нет доступа к камере/микрофону");
      }
      onCancel();
    }
  }

  function draw() {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2 || v.videoWidth === 0) return;

    const ctx = c.getContext("2d", { alpha: false });
    if (!ctx) return;

    const s = c.width;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) >> 1;
    const sy = (vh - side) >> 1;

    if (mirroredRef.current) {
      ctx.setTransform(-1, 0, 0, 1, s, 0);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    ctx.drawImage(v, sx, sy, side, side, 0, 0, s, s);

    if (canvasTrackRef.current && (canvasTrackRef.current as any).requestFrame) {
      (canvasTrackRef.current as any).requestFrame();
    }
  }

  function runLoop() {
    const v = videoRef.current;
    if (!v) return;

    cancelAnimationFrame(rafRef.current);

    const tick = () => {
      draw();
      if ("requestVideoFrameCallback" in v) {
        (v as any).requestVideoFrameCallback(tick);
      } else {
        // fallback: мобилки — рисуем каждый второй кадр (~30 fps вместо 60)
        if (IS_MOBILE) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(tick);
          });
        } else {
          rafRef.current = requestAnimationFrame(tick);
        }
      }
    };

    if ("requestVideoFrameCallback" in v) {
      (v as any).requestVideoFrameCallback(tick);
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  async function toggleFacing() {
    const next = facing === "user" ? "environment" : "user";
    try {
      await startCamera(next);
      setFacing(next);
      setMirrored(next === "user");
    } catch {}
  }

  function startRecording() {
    const c = canvasRef.current;
    const a = audioStreamRef.current;
    if (!c || !a) return;

    chunksRef.current = [];

    const cStream = c.captureStream(REC_FPS);
    canvasTrackRef.current = cStream.getVideoTracks()[0] || null;

    const combined = new MediaStream([
      ...cStream.getVideoTracks(),
      ...a.getAudioTracks(),
    ]);

    const codecs = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mime = codecs.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    mimeRef.current = mime || "video/webm";

    const rec = new MediaRecorder(
      combined,
      mime ? { mimeType: mime, videoBitsPerSecond: BITRATE } : undefined
    );
    mediaRecorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      const ext = mimeRef.current.includes("mp4") ? ".mp4" : ".webm";
      const file = new File([blob], `note-${Date.now()}${ext}`, {
        type: mimeRef.current,
      });
      cleanup();
      onRecorded(file);
    };

    rec.start(250);
    setIsRecording(true);
    setSeconds(0);
    startTsRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const e = Math.floor((Date.now() - startTsRef.current) / 1000);
      setSeconds(e);
      if (e >= maxDuration) stopRecording();
    }, 1000);
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanup() {
    cancelAnimationFrame(rafRef.current);
    const rec = mediaRecorderRef.current;
    if (rec) {
      try {
        if (rec.state === "recording") {
          rec.onstop = null as any;
          rec.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    canvasTrackRef.current = null;
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
    setIsRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;
  const perim = 2 * (94 + 94);

  if (mode === 'minimized') {
    return (
      <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:w-[480px] z-[60] bg-[#1f1f23]/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl shadow-black/60 p-3 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div
            className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black ring-1 ring-white/10 cursor-pointer active:scale-95 transition-transform"
            onClick={() => setMirrored((m) => !m)}
            title="Зеркало"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
            />
            {isRecording && <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {mirrored && (
              <div className="absolute bottom-0.5 right-0.5 text-[8px] text-white/70 bg-black/60 px-1 rounded">🪞</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-sm font-bold text-red-400 tabular-nums">{fmt(seconds)}</span>
              <span className="text-[10px] text-white/40 tabular-nums">/ {fmt(maxDuration)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-red-500 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasFlip && (
              <button onClick={toggleFacing} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all" title="Камера">
                <SwitchCamera size={15} />
              </button>
            )}
            {onExpand && (
              <button onClick={onExpand} className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all" title="Развернуть">
                <Maximize2 size={15} />
              </button>
            )}
            {isRecording ? (
              <button onClick={stopRecording} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 active:scale-95 transition-all flex items-center gap-1">
                <Square size={10} fill="currentColor" />Стоп
              </button>
            ) : isReady ? (
              <button onClick={startRecording} className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] active:scale-95 transition-all flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-white" />Запись
              </button>
            ) : null}
            <button onClick={() => { cleanup(); onCancel(); }} className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all" title="Отменить">
              <X size={16} />
            </button>
          </div>
        </div>
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="hidden" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        <div
          className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 cursor-pointer active:scale-[0.99] transition-transform"
          onClick={() => setMirrored((m) => !m)}
          title="Тап — зеркало"
        >
          {/* Видео только для превью, управление скрыто */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
          />
          {/* Canvas только для захвата записи, скрыт */}
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
          />

          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
            <rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={perim} strokeDashoffset={perim * (1 - progress / 100)} className="transition-all duration-300 ease-linear" />
          </svg>

          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-white/10 pointer-events-none">
            <span className="text-[11px] text-white/90 font-bold">
              {mirrored ? "🪞 зеркало" : "без зеркала"}
            </span>
          </div>

          {isRecording && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-white/10 pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-bold tabular-nums">{fmt(seconds)}</span>
              <span className="text-white/40 text-xs font-mono">/ {fmt(maxDuration)}</span>
            </div>
          )}

          {!isRecording && isReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">Нажмите ● для записи</p>
                <p className="text-white/20 text-xs mt-1">
                  Тап — зеркало · {facing === "user" ? "фронт" : "тыл"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 sm:gap-8">
          <button onClick={() => { cleanup(); onCancel(); }} className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80" title="Отменить">
            <X size={24} />
          </button>

          <button
            onClick={toggleFacing}
            disabled={!hasFlip}
            className={`w-14 h-14 rounded-full transition-all active:scale-95 flex items-center justify-center ${
              hasFlip ? "bg-white/10 hover:bg-white/20 text-white/80" : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
            title={hasFlip ? "Камера" : "Одна камера"}
          >
            <SwitchCamera size={22} />
          </button>

          {!isRecording ? (
            <button
              onClick={() => {
                if (!isReady) {
                  startCamera(facing).then(() => startRecording());
                } else {
                  startRecording();
                }
              }}
              disabled={!isReady}
              className="w-20 h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20"
            >
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center">
                <div className="w-5 h-5 rounded-sm bg-white" />
              </div>
            </button>
          ) : (
            <button onClick={stopRecording} className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 ring-4 ring-red-500/20">
              <Square size={28} className="text-white" fill="white" />
            </button>
          )}

          <button onClick={onMinimize} className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80" title="Свернуть">
            <Minimize2 size={22} />
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-white/30 text-xs font-medium">
            {isRecording
              ? `⏺ ${fmt(seconds)} · ${mirrored ? "🪞" : ""} ${facing === "user" ? "фронт" : "тыл"}`
              : isReady
              ? "↓ Свернуть · 🔄 Камера · ● Записать · ✕ Отменить"
              : "⏳ Загрузка камеры..."}
          </p>
        </div>
      </div>
    </div>
  );
}