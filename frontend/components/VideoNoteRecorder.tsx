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
  const videoStreamRef = useRef<MediaStream | null>(null);   // только видео
  const audioStreamRef = useRef<MediaStream | null>(null);   // только аудио
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTsRef = useRef(0); // 🆕 момент начала записи
  const rafRef = useRef<number>(0);
  const mimeRef = useRef<string>("video/webm");
  const mirroredRef = useRef(true);

  const [isRecording, setIsRecording] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [mirrored, setMirrored] = useState(true);            // по умолчанию ВКЛ для селфи
  const [hasFlip, setHasFlip] = useState(false);             // есть ли 2+ камеры

  useEffect(() => { mirroredRef.current = mirrored; }, [mirrored]);

  // --- запуск и остановка ---
  useEffect(() => {
    startAll();
    return () => cleanupResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // привязываем видео к элементу когда mode/isCameraReady меняются
  useEffect(() => {
    if (videoRef.current && videoStreamRef.current) {
      videoRef.current.srcObject = videoStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [mode, isCameraReady]);

  // --- КАМЕРА + МИКРОФОН (раздельно) ---
  async function startCamera(facingMode: "user" | "environment" = "user") {
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      });
      videoStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch {
      throw new Error("camera_denied");
    }
  }

  async function startMicrophone() {
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
    } catch {
      throw new Error("mic_denied");
    }
  }

  async function startAll() {
    try {
      await startMicrophone();
      await startCamera("user");

      // Сколько камер доступно?
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setHasFlip(cams.length > 1);

      setIsCameraReady(true);
      startDrawLoop();
    } catch (e: any) {
      if (e?.message === "camera_denied" || e?.message === "mic_denied") {
        if (onDenied) onDenied();
        else alert("Нет доступа к камере/микрофону");
      }
      onCancel();
    }
  }

  // --- CANVAS: квадрат 720×720 + зеркало. ИМЕННО ЭТО пишем в файл ---
  function startDrawLoop() {
    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const size = canvas.width;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          const side = Math.min(vw, vh);          // квадрат по центру кадра
          const sx = (vw - side) / 2;
          const sy = (vh - side) / 2;
          ctx.save();
          ctx.clearRect(0, 0, size, size);
          if (mirroredRef.current) {
            ctx.translate(size, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  // --- ПЕРЕКЛЮЧЕНИЕ КАМЕРЫ (работает даже во время записи) ---
  async function toggleFacing() {
    const next = facing === "user" ? "environment" : "user";
    try {
      await startCamera(next);
      setFacing(next);
      // при переключении на тыльную камеру — выключаем зеркало (естественно для мира)
      // при возврате на фронталку — включаем
      setMirrored(next === "user");
    } catch {
      // камера недоступна
    }
  }

  // --- ЗАПИСЬ (canvas + аудио) ---
  function startRecording() {
    const canvas = canvasRef.current;
    const audio = audioStreamRef.current;
    if (!canvas || !audio) return;

    chunksRef.current = [];

    // Составной стрим: видео с canvas + аудио с микрофона
    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audio.getAudioTracks(),
    ]);

    // Подбираем MIME (iOS не умеет webm)
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    mimeRef.current = mime || "video/webm";

    const recorder = new MediaRecorder(
      combined,
      mime ? { mimeType: mime, videoBitsPerSecond: 1_500_000 } : undefined
    );
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      const ext = mimeRef.current.includes("mp4") ? ".mp4" : ".webm";
      const file = new File([blob], `video-note-${Date.now()}${ext}`, {
        type: mimeRef.current,
      });
      cleanupResources();
      onRecorded(file);
    };

    recorder.start(250);
    setIsRecording(true);
    setSeconds(0);
    startTsRef.current = Date.now();

    // 🆕 Таймер по реальному времени. СТОП — в колбэке интервала,
    // а не в апдейтере состояния → срабатывает гарантированно.
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTsRef.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= maxDuration) {
        stopRecording(); // ✅ сам остановился и отправил файл
      }
    }, 500);
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function cleanupResources() {
    cancelAnimationFrame(rafRef.current);
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.onstop = null as any; // не отправлять при отмене
          mediaRecorderRef.current.stop();
        }
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    audioStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioStreamRef.current = null;
    setIsRecording(false);
    setSeconds(0);
    chunksRef.current = [];
  }

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = maxDuration > 0 ? Math.min((seconds / maxDuration) * 100, 100) : 0;
  const perimeter = 2 * (94 + 94);

  // --- КЛИК по превью = переключение зеркала ---
  function handlePreviewClick() {
    setMirrored((m) => !m);
  }

  // ==================== MINIMIZED ====================
  if (mode === 'minimized') {
    return (
      <div className="fixed bottom-20 left-3 right-3 md:left-auto md:right-6 md:w-[480px] z-[60] bg-[#1f1f23]/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl shadow-black/60 p-3 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center gap-3">
          <div
            className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-black ring-1 ring-white/10 cursor-pointer active:scale-95 transition-transform"
            onClick={handlePreviewClick}
            title="Зеркало вкл/выкл"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transition-transform"
              style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
            />
            {isRecording && <div className="absolute top-1 left-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            {mirrored && (
              <div className="absolute bottom-0.5 right-0.5 text-[8px] text-white/70 bg-black/60 px-1 rounded">🪞</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-sm font-bold text-red-400 tabular-nums">{formatTime(seconds)}</span>
              <span className="text-[10px] text-white/40 tabular-nums">/ {formatTime(maxDuration)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-red-500 transition-all duration-300 ease-linear" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* 🆕 СМЕНА КАМЕРЫ */}
            {hasFlip && (
              <button
                onClick={toggleFacing}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                title="Переключить камеру"
              >
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
            ) : isCameraReady ? (
              <button onClick={startRecording} className="px-3 py-1.5 rounded-lg bg-[#8b5cf6] text-white text-xs font-bold hover:bg-[#7c3aed] active:scale-95 transition-all flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-white" />Запись
              </button>
            ) : null}
            <button onClick={() => { cleanupResources(); onCancel(); }} className="p-2 rounded-lg text-white/50 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all" title="Отменить">
              <X size={16} />
            </button>
          </div>
        </div>
        {/* скрытый canvas для записи */}
        <canvas ref={canvasRef} width={720} height={720} className="hidden" />
      </div>
    );
  }

  // ==================== EXPANDED ====================
  return (
    <div className="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center">
      <div className="relative flex flex-col items-center">
        {/* 🆕 КЛИКАЕМЫЙ КАРКАС — зеркало */}
        <div
          className="relative w-[340px] h-[340px] sm:w-[440px] sm:h-[440px] rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 cursor-pointer active:scale-[0.99] transition-transform"
          onClick={handlePreviewClick}
          title="Нажмите чтобы включить/выключить зеркало"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover transition-transform"
            style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
          />
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
            <rect x="1.5" y="1.5" width="97" height="97" rx="10" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={perimeter} strokeDashoffset={perimeter * (1 - progress / 100)} className="transition-all duration-300 ease-linear" />
          </svg>

          {/* 🆕 Индикатор зеркала */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 ring-1 ring-white/10 pointer-events-none">
            <span className="text-[11px] text-white/90 font-bold">
              {mirrored ? "🪞 зеркало" : "без зеркала"}
            </span>
          </div>

          {isRecording && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-1.5 ring-1 ring-white/10 pointer-events-none">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white text-sm font-mono font-bold tabular-nums">{formatTime(seconds)}</span>
              <span className="text-white/40 text-xs font-mono">/ {formatTime(maxDuration)}</span>
            </div>
          )}
          {!isRecording && isCameraReady && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-white/40 text-sm font-medium">Нажмите ● для записи</p>
                <p className="text-white/20 text-xs mt-1">
                  Тап по кадру — зеркало · {facing === "user" ? "фронт" : "тыл"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* кнопки снизу */}
        <div className="mt-6 flex items-center justify-center gap-6 sm:gap-8">
          <button onClick={() => { cleanupResources(); onCancel(); }} className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 transition-colors active:scale-95 flex items-center justify-center text-white/80" title="Отменить">
            <X size={24} />
          </button>

          {/* 🆕 СМЕНА КАМЕРЫ */}
          <button
            onClick={toggleFacing}
            disabled={!hasFlip}
            className={`w-14 h-14 rounded-full transition-all active:scale-95 flex items-center justify-center ${
              hasFlip
                ? "bg-white/10 hover:bg-white/20 text-white/80"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
            title={hasFlip ? "Переключить камеру" : "Только одна камера"}
          >
            <SwitchCamera size={22} />
          </button>

          {!isRecording ? (
            <button onClick={() => { if (!isCameraReady) startCamera(facing); setTimeout(startRecording, 300); }} disabled={!isCameraReady} className="w-20 h-20 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-[#8b5cf6]/30 ring-4 ring-[#8b5cf6]/20">
              <div className="w-9 h-9 rounded-full border-[3px] border-white flex items-center justify-center"><div className="w-5 h-5 rounded-sm bg-white" /></div>
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
              ? `⏺ Запись ... ${formatTime(seconds)} · ${mirrored ? "🪞" : ""} ${facing === "user" ? "фронт" : "тыл"}`
              : isCameraReady
              ? "↓ Свернуть · 🔄 Камера · ● Записать · ✕ Отменить"
              : "⏳ Загрузка камеры..."}
          </p>
        </div>
      </div>

      {/* скрытый canvas — источник записи */}
      <canvas ref={canvasRef} width={720} height={720} className="hidden" />
    </div>
  );
}