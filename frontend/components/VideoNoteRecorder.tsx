"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlipHorizontal, Minimize2, RotateCcw, Square, X } from "lucide-react";

interface Props {
  mode?: "expanded" | "minimized";
  onRecorded: (file: File) => void;
  onCancel: () => void;
  onMinimize: () => void;
  onExpand?: () => void;
  onDenied?: () => void;
  maxDuration?: number;
}

type FacingMode = "user" | "environment";

const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const FPS = 30;
const VIDEO_BITRATE = 4_000_000;
const AUDIO_BITRATE = 128_000;
const PROCESS_ENDPOINT = "/api/video-note";

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/mp4;codecs=h264,aac",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function getExtension(type: string) {
  return type.includes("mp4") ? "mp4" : "webm";
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VideoNoteRecorder({
  mode = "expanded",
  onRecorded,
  onCancel,
  onMinimize,
  onExpand,
  onDenied,
  maxDuration = 60,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(false);
  const recordingRef = useRef(false);
  const processingRef = useRef(false);
  const facingRef = useRef<FacingMode>("user");
  const mirroredRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [mirrored, setMirrored] = useState(true);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const detectCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitchCamera(devices.filter((d) => d.kind === "videoinput").length > 1);
    } catch {
      setCanSwitchCamera(false);
    }
  }, []);

  const startCamera = useCallback(
    async (nextMode: FacingMode) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Камера не поддерживается");
      }

      const old = streamRef.current;
      if (old) {
        old.getVideoTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextMode },
          width: { ideal: MAX_WIDTH, min: 640 },
          height: { ideal: MAX_HEIGHT, min: 480 },
          frameRate: { ideal: FPS, max: FPS },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (!mountedRef.current) {
        stopStream(stream);
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        try {
          await video.play();
        } catch {}
      }

      facingRef.current = nextMode;
      mirroredRef.current = nextMode === "user";
      setMirrored(nextMode === "user");
      setReady(true);
      await detectCameras();
    },
    [detectCameras, stopStream]
  );

  const initialize = useCallback(async () => {
    try {
      setError(null);
      setReady(false);
      await startCamera("user");
    } catch (err: any) {
      let message = "Не удалось получить доступ к камере";
      switch (err?.name) {
        case "NotAllowedError":
        case "PermissionDeniedError":
          message = "Разрешите доступ к камере и микрофону";
          break;
        case "NotFoundError":
          message = "Камера или микрофон не найдены";
          break;
        case "NotReadableError":
          message = "Камера уже используется";
          break;
        case "SecurityError":
          message = "Браузер запретил доступ";
          break;
        case "OverconstrainedError":
          message = "Камера не поддерживает режим";
          break;
      }
      if (mountedRef.current) setError(message);
      onDenied?.();
    }
  }, [onDenied, startCamera]);

  useEffect(() => {
    mountedRef.current = true;
    initialize();
    return () => {
      mountedRef.current = false;
      stopTimer();
      const r = recorderRef.current;
      if (r) {
        try {
          r.onstop = null;
          r.ondataavailable = null;
          r.onerror = null;
          if (r.state !== "inactive") r.stop();
        } catch {}
      }
      recorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, [initialize, stopStream, stopTimer]);

  const toggleMirror = useCallback(() => {
    setMirrored((v) => {
      mirroredRef.current = !v;
      return !v;
    });
  }, []);

  const switchCamera = useCallback(async () => {
    if (recordingRef.current || processingRef.current || switching || !canSwitchCamera) return;
    const next: FacingMode = facingRef.current === "user" ? "environment" : "user";
    try {
      setSwitching(true);
      await startCamera(next);
    } catch {
      setError("Не удалось переключить камеру");
    } finally {
      if (mountedRef.current) setSwitching(false);
    }
  }, [canSwitchCamera, startCamera, switching]);

  const processVideo = useCallback(
    async (blob: Blob, mimeType: string, mirror: boolean) => {
      const ext = getExtension(mimeType);
      const inputFile = new File([blob], `source-${Date.now()}.${ext}`, { type: mimeType });
      const fd = new FormData();
      fd.append("file", inputFile);
      fd.append("mirror", mirror ? "1" : "0");
      fd.append("size", "640");

      const res = await fetch(PROCESS_ENDPOINT, { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "Не удалось обработать видео";
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch {}
        throw new Error(msg);
      }
      const resultBlob = await res.blob();
      if (!resultBlob.size) throw new Error("Пустое видео");
      return new File([resultBlob], `note-${Date.now()}.mp4`, { type: "video/mp4" });
    },
    []
  );

  const startRecording = useCallback(async () => {
    if (recordingRef.current || processingRef.current) return;
    const stream = streamRef.current;
    if (!stream) {
      setError("Камера не готова");
      return;
    }
    if (!stream.getVideoTracks()[0] || !stream.getAudioTracks()[0]) {
      setError("Нет видео или аудио");
      return;
    }
    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError("Браузер не поддерживает запись");
      return;
    }

    try {
      const video = videoRef.current;
      if (video) try { await video.play(); } catch {}

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        if (mountedRef.current) setError("Ошибка записи");
      };
      recorder.onstop = async () => {
        stopTimer();
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (!chunks.length) {
          if (mountedRef.current) {
            setRecording(false);
            setError("Нет данных");
          }
          return;
        }
        const sourceBlob = new Blob(chunks, { type: mimeType });
        if (!sourceBlob.size) {
          if (mountedRef.current) {
            setRecording(false);
            setError("Пустой файл");
          }
          return;
        }
        processingRef.current = true;
        if (mountedRef.current) {
          setRecording(false);
          setProcessing(true);
        }
        try {
          const file = await processVideo(sourceBlob, mimeType, mirroredRef.current);
          if (!mountedRef.current) return;
          onRecorded(file);
        } catch (err: any) {
          if (mountedRef.current) setError(err?.message || "Ошибка обработки");
        } finally {
          processingRef.current = false;
          if (mountedRef.current) setProcessing(false);
        }
      };

      recorder.start(1000);
      recordingRef.current = true;
      setRecording(true);
      setSeconds(0);
      setError(null);
      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        if (!mountedRef.current) return;
        setSeconds(elapsed);
        if (elapsed >= maxDuration) stopRecording();
      }, 250);
    } catch (err: any) {
      recordingRef.current = false;
      stopTimer();
      if (mountedRef.current) {
        setRecording(false);
        setError(err?.message || "Не удалось начать");
      }
    }
  }, [maxDuration, onRecorded, processVideo, stopTimer]);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    recordingRef.current = false;
    stopTimer();
    if (!r) {
      setRecording(false);
      return;
    }
    if (r.state === "recording") {
      try {
        r.stop();
      } catch {
        if (mountedRef.current) setRecording(false);
      }
    } else {
      setRecording(false);
    }
  }, [stopTimer]);

  const cancel = useCallback(() => {
    recordingRef.current = false;
    processingRef.current = false;
    stopTimer();
    const r = recorderRef.current;
    if (r) {
      try {
        r.onstop = null;
        r.ondataavailable = null;
        r.onerror = null;
        if (r.state !== "inactive") r.stop();
      } catch {}
    }
    recorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
    onCancel();
  }, [onCancel, stopStream, stopTimer]);

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden" && recordingRef.current) stopRecording();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [stopRecording]);

  const progress = maxDuration > 0 ? Math.min(100, (seconds / maxDuration) * 100) : 0;
  const time = formatTime(seconds);
  const maxTime = formatTime(maxDuration);

  if (error) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black p-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <X size={28} className="text-red-400" />
        </div>
        <p className="mb-6 text-center text-sm text-white/80">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setError(null); initialize(); }}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-black active:scale-95"
          >
            Повторить
          </button>
          <button
            onClick={cancel}
            className="rounded-xl bg-white/10 px-5 py-2.5 text-sm text-white active:scale-95"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <p className="mt-4 text-sm text-white/70">Обработка видео…</p>
      </div>
    );
  }

  if (mode === "minimized") {
    return (
      <div className="fixed bottom-4 left-3 right-3 z-[300] md:left-auto md:right-5 md:w-[420px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#18181b]/95 p-2.5 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={toggleMirror}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-white/30"
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
            />
            {recording && <span className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-white">{time}</span>
              <span className="text-xs text-white/30">/ {maxTime}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canSwitchCamera && !recording && (
              <button
                onClick={switchCamera}
                disabled={switching}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <RotateCcw size={16} className={switching ? "animate-spin" : ""} />
              </button>
            )}
            {onExpand && (
              <button onClick={onExpand} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
                <Minimize2 size={16} />
              </button>
            )}
            {!recording ? (
              <button
                onClick={startRecording}
                disabled={!ready}
                className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
              >
                Запись
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white active:scale-95"
              >
                <Square size={10} fill="currentColor" />
                Стоп
              </button>
            )}
            <button onClick={cancel} className="rounded-lg p-2 text-white/40 hover:bg-red-500/10 hover:text-red-400">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== EXPANDED — КАК В ТГ ====================
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      {/* Верхняя панель */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={cancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
        >
          <X size={20} />
        </button>

        {recording && (
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-mono text-sm font-semibold text-white">{time}</span>
          </div>
        )}

        {onMinimize && (
          <button
            onClick={onMinimize}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20"
          >
            <Minimize2 size={20} />
          </button>
        )}
      </div>

      {/* Центр — квадратная камера */}
      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative aspect-square w-[72vw] max-w-[380px]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
          />

          {/* Рамка + уголки */}
          <div className="pointer-events-none absolute inset-0 border-[1.5px] border-white/40" />
          <div className="pointer-events-none absolute -left-[2px] -top-[2px] h-5 w-5 border-l-[2.5px] border-t-[2.5px] border-white" />
          <div className="pointer-events-none absolute -right-[2px] -top-[2px] h-5 w-5 border-r-[2.5px] border-t-[2.5px] border-white" />
          <div className="pointer-events-none absolute -bottom-[2px] -left-[2px] h-5 w-5 border-b-[2.5px] border-l-[2.5px] border-white" />
          <div className="pointer-events-none absolute -bottom-[2px] -right-[2px] h-5 w-5 border-b-[2.5px] border-r-[2.5px] border-white" />

          {/* Подпись */}
          <div className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase">
            Квадрат 1:1
          </div>
        </div>
      </div>

      {/* Нижняя панель с кнопками */}
      <div className="z-20 flex items-center justify-center gap-10 pb-10 pt-4">
        {/* Переключение камеры */}
        {canSwitchCamera && (
          <button
            onClick={switchCamera}
            disabled={recording || switching}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-30"
          >
            <RotateCcw size={20} className={switching ? "animate-spin" : ""} />
          </button>
        )}

        {/* Кнопка записи / стоп */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={!ready && !recording}
          className="flex items-center justify-center transition active:scale-90 disabled:opacity-40"
        >
          {recording ? (
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-red-500 shadow-lg shadow-red-500/30">
              <Square size={28} fill="white" className="text-white" />
            </div>
          ) : (
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white bg-red-500 shadow-lg transition hover:scale-105">
              <div className="h-10 w-10 rounded-full bg-white" />
            </div>
          )}
        </button>

        {/* Зеркало */}
        <button
          onClick={toggleMirror}
          disabled={recording}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-30"
        >
          <FlipHorizontal size={20} />
        </button>
      </div>

      {/* Прогресс-линия снизу экрана */}
      {recording && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div className="h-full bg-red-500 transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}