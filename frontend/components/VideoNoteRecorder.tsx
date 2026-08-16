"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Camera,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  RotateCcw,
  Square,
  X,
} from "lucide-react";

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
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
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
  const [facing, setFacing] = useState<FacingMode>("user");
  const [mirrored, setMirrored] = useState(true);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      try { track.stop(); } catch {}
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
      const cameras = devices.filter((d) => d.kind === "videoinput");
      setCanSwitchCamera(cameras.length > 1);
    } catch {
      setCanSwitchCamera(false);
    }
  }, []);

  const startCamera = useCallback(
    async (mode: FacingMode) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Камера не поддерживается браузером");
      }

      const oldStream = streamRef.current;
      if (oldStream) {
        oldStream.getVideoTracks().forEach((track) => {
          try { track.stop(); } catch {}
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
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
        try { await video.play(); } catch {}
      }

      facingRef.current = mode;
      mirroredRef.current = mode === "user";

      setFacing(mode);
      setMirrored(mode === "user");
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
      console.error("Camera initialization error:", err);
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
          message = "Камера уже используется другим приложением";
          break;
        case "SecurityError":
          message = "Браузер запретил доступ к камере";
          break;
        case "OverconstrainedError":
          message = "Камера не поддерживает выбранный режим";
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

      const recorder = recorderRef.current;
      if (recorder) {
        try {
          recorder.onstop = null;
          recorder.ondataavailable = null;
          recorder.onerror = null;
          if (recorder.state !== "inactive") recorder.stop();
        } catch {}
      }
      recorderRef.current = null;

      stopStream(streamRef.current);
      streamRef.current = null;
      chunksRef.current = [];
    };
  }, [initialize, stopStream, stopTimer]);

  const toggleMirror = useCallback(() => {
    setMirrored((value) => {
      const next = !value;
      mirroredRef.current = next;
      return next;
    });
  }, []);

  const switchCamera = useCallback(async () => {
    if (recordingRef.current || processingRef.current || switching || !canSwitchCamera) return;

    const next: FacingMode = facingRef.current === "user" ? "environment" : "user";

    try {
      setSwitching(true);
      await startCamera(next);
    } catch (err) {
      console.error("Camera switch error:", err);
      setError("Не удалось переключить камеру");
    } finally {
      if (mountedRef.current) setSwitching(false);
    }
  }, [canSwitchCamera, startCamera, switching]);

  const processVideo = useCallback(
    async (blob: Blob, mimeType: string, mirror: boolean) => {
      const extension = getExtension(mimeType);
      const inputFile = new File(
        [blob],
        `video-note-source-${Date.now()}.${extension}`,
        { type: mimeType }
      );

      const formData = new FormData();
      formData.append("file", inputFile);
      formData.append("mirror", mirror ? "1" : "0");
      formData.append("size", "640");

      const response = await fetch(PROCESS_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Не удалось обработать видео";
        try {
          const data = await response.json();
          if (data?.error) message = data.error;
        } catch {}
        throw new Error(message);
      }

      const resultBlob = await response.blob();
      if (!resultBlob.size) throw new Error("Сервер вернул пустое видео");

      return new File(
        [resultBlob],
        `video-note-${Date.now()}.mp4`,
        { type: "video/mp4", lastModified: Date.now() }
      );
    },
    []
  );

  const startRecording = useCallback(async () => {
    if (recordingRef.current || processingRef.current) return;

    const stream = streamRef.current;
    if (!stream) {
      setError("Камера еще не готова");
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (!videoTrack) {
      setError("Видеотрек отсутствует");
      return;
    }
    if (!audioTrack) {
      setError("Аудиотрек отсутствует");
      return;
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      setError("Браузер не поддерживает запись видео");
      return;
    }

    try {
      const video = videoRef.current;
      if (video) {
        try { await video.play(); } catch {}
      }

      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE,
      });

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        if (mountedRef.current) setError("Ошибка во время записи");
      };

      recorder.onstop = async () => {
        stopTimer();
        const chunks = chunksRef.current;
        chunksRef.current = [];

        if (!chunks.length) {
          if (mountedRef.current) {
            setRecording(false);
            setError("Запись не содержит данных");
          }
          return;
        }

        const sourceBlob = new Blob(chunks, { type: mimeType });
        if (!sourceBlob.size) {
          if (mountedRef.current) {
            setRecording(false);
            setError("Получен пустой файл");
          }
          return;
        }

        processingRef.current = true;
        if (mountedRef.current) {
          setRecording(false);
          setProcessing(true);
        }

        try {
          const finalFile = await processVideo(sourceBlob, mimeType, mirroredRef.current);
          if (!mountedRef.current) return;
          onRecorded(finalFile);
        } catch (err: any) {
          console.error("Video processing error:", err);
          if (mountedRef.current) setError(err?.message || "Не удалось обработать видео");
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
      console.error("Start recording error:", err);
      recordingRef.current = false;
      stopTimer();
      if (mountedRef.current) {
        setRecording(false);
        setError(err?.message || "Не удалось начать запись");
      }
    }
  }, [maxDuration, onRecorded, processVideo, stopTimer]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recordingRef.current = false;
    stopTimer();

    if (!recorder) {
      setRecording(false);
      return;
    }

    if (recorder.state === "recording") {
      try {
        recorder.stop();
      } catch (err) {
        console.error("Stop recording error:", err);
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

    const recorder = recorderRef.current;
    if (recorder) {
      try {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
    }
    recorderRef.current = null;

    stopStream(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];

    onCancel();
  }, [onCancel, stopStream, stopTimer]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && recordingRef.current) {
        stopRecording();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [stopRecording]);

  const progress = maxDuration > 0 ? Math.min(100, (seconds / maxDuration) * 100) : 0;
  const time = formatTime(seconds);
  const maxTime = formatTime(maxDuration);

  if (error) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black p-5">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <Camera size={24} className="text-red-400" />
          </div>
          <p className="mt-4 text-sm text-white/80">{error}</p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => { setError(null); initialize(); }}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-black active:scale-95"
            >
              Повторить
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white active:scale-95"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (processing) {
    return (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="mt-4 text-sm text-white/70">Подготавливаем видео…</p>
          <p className="mt-1 text-xs text-white/30">Формируем квадратное видео</p>
        </div>
      </div>
    );
  }

  if (mode === "minimized") {
    return (
      <div className="fixed bottom-4 left-3 right-3 z-[300] md:left-auto md:right-5 md:w-[440px]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#18181b]/95 p-2.5 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={toggleMirror}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-black ring-2 ring-white/40"
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
              <div className="h-full bg-red-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canSwitchCamera && !recording && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={switching}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <RotateCcw size={16} className={switching ? "animate-spin" : ""} />
              </button>
            )}
            {onExpand && (
              <button type="button" onClick={onExpand} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
                <Maximize2 size={16} />
              </button>
            )}
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!ready}
                className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white active:scale-95 disabled:opacity-40"
              >
                Запись
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white active:scale-95"
              >
                <Square size={10} fill="currentColor" />
                Стоп
              </button>
            )}
            <button type="button" onClick={cancel} className="rounded-lg p-2 text-white/40 hover:bg-red-500/10 hover:text-red-400">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== EXPANDED MODE ==========
  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-black">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Квадратный гайд с видео */}
        <div className="relative aspect-square h-auto max-h-full w-auto max-w-full">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: mirrored ? "scaleX(-1)" : undefined }}
          />
          {/* Затемнение вне квадрата */}
          <div className="pointer-events-none absolute -top-[100vh] left-0 right-0 h-[100vh] bg-black/70" />
          <div className="pointer-events-none absolute -bottom-[100vh] left-0 right-0 h-[100vh] bg-black/70" />
          <div className="pointer-events-none absolute top-0 bottom-0 -left-[100vw] w-[100vw] bg-black/70" />
          <div className="pointer-events-none absolute top-0 bottom-0 -right-[100vw] w-[100vw] bg-black/70" />
          {/* Рамка */}
          <div className="pointer-events-none absolute inset-0 border-[2.5px] border-white" />
          {/* Подпись */}
          <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tracking-widest text-white/90">
            1:1 · КВАДРАТ
          </div>
        </div>

        {/* REC */}
        {recording && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-semibold tracking-wider text-white">REC</span>
          </div>
        )}

        {/* Верхняя панель */}
        <div className="absolute right-4 top-4 flex items-center gap-2">
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className="rounded-xl bg-black/40 p-2.5 text-white/80 backdrop-blur-md transition hover:bg-white/20"
            >
              <Minimize2 size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            className="rounded-xl bg-black/40 p-2.5 text-white/80 backdrop-blur-md transition hover:bg-red-500/20 hover:text-red-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Нижняя панель */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 pb-10 pt-16">
          <div className="mx-auto mb-6 max-w-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-lg font-semibold text-white">{time}</span>
              <span className="text-sm text-white/40">/ {maxTime}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-red-500 transition-[width] duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex items-center justify-center gap-8">
            {canSwitchCamera && !recording && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={switching}
                className="rounded-full bg-white/10 p-4 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-30"
              >
                <RotateCcw size={22} className={switching ? "animate-spin" : ""} />
              </button>
            )}

            <button
              type="button"
              onClick={toggleMirror}
              disabled={recording}
              className="rounded-full bg-white/10 p-4 text-white backdrop-blur-md transition hover:bg-white/20 disabled:opacity-30"
            >
              <FlipHorizontal size={22} />
            </button>

            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!ready}
                className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/20 bg-red-500 text-white shadow-lg transition active:scale-95 disabled:opacity-40"
              >
                <div className="h-6 w-6 rounded-sm bg-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition active:scale-95"
              >
                <Square size={28} fill="currentColor" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}