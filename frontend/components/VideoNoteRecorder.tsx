"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Camera,
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

/**
 * Важно:
 *
 * Preview:
 *   camera stream -> <video>
 *
 * Recording:
 *   <video> -> canvas -> canvas.captureStream() + microphone -> MediaRecorder
 *
 * Поэтому canvas вообще не работает, пока запись не началась.
 */

const IS_MOBILE =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const VIDEO_SIZE = IS_MOBILE ? 480 : 640;
const FPS = IS_MOBILE ? 24 : 30;

const VIDEO_BITRATE = IS_MOBILE ? 1_000_000 : 2_500_000;
const AUDIO_BITRATE = 128_000;

const MIME_TYPES = IS_MOBILE
  ? [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=h264,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ]
  : [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type)
  ) ?? "";
}

function getFileExtension(mime: string) {
  return mime.includes("mp4") ? "mp4" : "webm";
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const mountedRef = useRef(true);
  const recordingRef = useRef(false);
  const mirroredRef = useRef(true);
  const facingRef = useRef<"user" | "environment">("user");

  const [isReady, setIsReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const [seconds, setSeconds] = useState(0);

  const [facing, setFacing] = useState<"user" | "environment">("user");

  const [mirrored, setMirrored] = useState(true);

  const [hasFrontCamera, setHasFrontCamera] = useState(false);
  const [hasBackCamera, setHasBackCamera] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [isSwitchingCamera, setIsSwitchingCamera] =
    useState(false);

  /**
   * ---------------------------------------------------------
   * Helpers
   * ---------------------------------------------------------
   */

  const stopStream = useCallback((stream: MediaStream | null) => {
    if (!stream) return;

    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * ---------------------------------------------------------
   * Camera detection
   * ---------------------------------------------------------
   */

  const detectCameras = useCallback(async () => {
    try {
      const devices =
        await navigator.mediaDevices.enumerateDevices();

      const cameras = devices.filter(
        (device) => device.kind === "videoinput"
      );

      const hasFront = cameras.some((camera) =>
        /front|user|facetime/i.test(camera.label)
      );

      const hasBack = cameras.some((camera) =>
        /back|rear|environment/i.test(camera.label)
      );

      /**
       * После permission labels становятся доступными.
       *
       * На мобильном Safari label может быть пустым,
       * поэтому если камер > 1 — считаем, что flip доступен.
       */
      if (cameras.length > 1) {
        setHasFrontCamera(true);
        setHasBackCamera(true);
      } else {
        setHasFrontCamera(hasFront);
        setHasBackCamera(hasBack);
      }
    } catch (err) {
      console.warn("enumerateDevices failed:", err);
    }
  }, []);

  /**
   * ---------------------------------------------------------
   * Camera
   * ---------------------------------------------------------
   */

  const startCamera = useCallback(
    async (
      facingMode: "user" | "environment",
      keepAudio = false
    ) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Камера не поддерживается этим браузером"
        );
      }

      setIsSwitchingCamera(true);

      try {
        /**
         * При смене камеры старый stream нужно обязательно
         * остановить до getUserMedia().
         *
         * Это особенно важно для iOS/PWA.
         */
        const oldStream = mediaStreamRef.current;

        if (oldStream) {
          oldStream
            .getVideoTracks()
            .forEach((track) => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: facingMode,
            },

            /**
             * Не используем exact.
             *
             * exact + iOS/PWA иногда приводит к
             * OverconstrainedError.
             */
            width: {
              ideal: IS_MOBILE ? 720 : 1280,
            },

            height: {
              ideal: IS_MOBILE ? 720 : 720,
            },

            frameRate: {
              ideal: FPS,
              max: 30,
            },
          },

          /**
           * Если уже есть audio stream, при переключении камеры
           * новый микрофон не нужен.
           */
          audio: keepAudio
            ? false
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        });

        if (!mountedRef.current) {
          stopStream(stream);
          return;
        }

        if (keepAudio && mediaStreamRef.current) {
          const audioTracks =
            mediaStreamRef.current.getAudioTracks();

          audioTracks.forEach((track) => {
            try {
              stream.addTrack(track);
            } catch {
              // ignore
            }
          });
        }

        mediaStreamRef.current = stream;

        const video = videoRef.current;

        if (video) {
          video.srcObject = stream;

          /**
           * На iOS важно:
           * muted + playsInline + play()
           */
          video.muted = true;
          video.playsInline = true;

          try {
            await video.play();
          } catch {
            /**
             * Если autoplay был заблокирован, пользовательский
             * click позже повторит play().
             */
          }
        }

        facingRef.current = facingMode;

        if (mountedRef.current) {
          setFacing(facingMode);
          setMirrored(facingMode === "user");
          mirroredRef.current = facingMode === "user";
          setIsReady(true);
          setError(null);
        }

        await detectCameras();
      } finally {
        if (mountedRef.current) {
          setIsSwitchingCamera(false);
        }
      }
    },
    [detectCameras, stopStream]
  );

  /**
   * ---------------------------------------------------------
   * Initial setup
   * ---------------------------------------------------------
   */

  const initialize = useCallback(async () => {
    try {
      setError(null);

      /**
       * Один getUserMedia вместо двух.
       *
       * Это заметно надежнее для Safari/PWA.
       */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: "user",
          },
          width: {
            ideal: IS_MOBILE ? 720 : 1280,
          },
          height: {
            ideal: IS_MOBILE ? 720 : 720,
          },
          frameRate: {
            ideal: FPS,
            max: 30,
          },
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

      mediaStreamRef.current = stream;

      const video = videoRef.current;

      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        try {
          await video.play();
        } catch {
          // user interaction will retry
        }
      }

      facingRef.current = "user";
      mirroredRef.current = true;

      setFacing("user");
      setMirrored(true);
      setIsReady(true);

      await detectCameras();
    } catch (err: any) {
      console.error("getUserMedia error:", err);

      if (!mountedRef.current) return;

      let message = "Не удалось получить доступ к камере";

      if (
        err?.name === "NotAllowedError" ||
        err?.name === "PermissionDeniedError"
      ) {
        message =
          "Разрешите доступ к камере и микрофону";
      } else if (err?.name === "NotFoundError") {
        message = "Камера или микрофон не найдены";
      } else if (err?.name === "NotReadableError") {
        message =
          "Камера уже используется другим приложением";
      } else if (err?.name === "SecurityError") {
        message =
          "Доступ к камере запрещен браузером";
      }

      setError(message);

      onDenied?.();
    }
  }, [detectCameras, onDenied, stopStream]);

  /**
   * ---------------------------------------------------------
   * Mount
   * ---------------------------------------------------------
   */

  useEffect(() => {
    mountedRef.current = true;

    initialize();

    return () => {
      mountedRef.current = false;

      stopAnimation();
      stopTimer();

      const recorder = mediaRecorderRef.current;

      if (recorder) {
        try {
          recorder.ondataavailable = null;
          recorder.onerror = null;
          recorder.onstop = null;

          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        } catch {
          // ignore
        }
      }

      mediaRecorderRef.current = null;

      stopStream(recordingStreamRef.current);
      stopStream(mediaStreamRef.current);

      recordingStreamRef.current = null;
      mediaStreamRef.current = null;
    };
  }, [initialize, stopAnimation, stopStream, stopTimer]);

  /**
   * ---------------------------------------------------------
   * Camera switching
   * ---------------------------------------------------------
   */

  const switchCamera = useCallback(async () => {
    if (isRecording || isSwitchingCamera) return;

    const next =
      facingRef.current === "user"
        ? "environment"
        : "user";

    try {
      await startCamera(next, true);
    } catch (err) {
      console.error("Camera switch failed:", err);

      /**
       * Если environment камера отсутствует или не поддерживается,
       * возвращаемся к текущему состоянию.
       */
      setError("Не удалось переключить камеру");
    }
  }, [isRecording, isSwitchingCamera, startCamera]);

  /**
   * ---------------------------------------------------------
   * Mirror
   * ---------------------------------------------------------
   */

  const toggleMirror = useCallback(() => {
    setMirrored((value) => {
      const next = !value;
      mirroredRef.current = next;
      return next;
    });
  }, []);

  /**
   * ---------------------------------------------------------
   * Canvas drawing
   * ---------------------------------------------------------
   *
   * Canvas запускается ТОЛЬКО во время записи.
   *
   * Никаких постоянных requestAnimationFrame в preview.
   */

  const drawFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    if (
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return;
    }

    const ctx = canvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
    });

    if (!ctx) return;

    const size = canvas.width;

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    /**
     * Center crop -> square.
     */
    const sourceSize = Math.min(vw, vh);

    const sx = (vw - sourceSize) / 2;
    const sy = (vh - sourceSize) / 2;

    ctx.save();

    /**
     * Mirror only the recorded video.
     */
    if (mirroredRef.current) {
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(
      video,
      sx,
      sy,
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size
    );

    ctx.restore();
  }, []);

  /**
   * ---------------------------------------------------------
   * Recording render loop
   * ---------------------------------------------------------
   */

  const startCanvasLoop = useCallback(() => {
    stopAnimation();

    const render = () => {
      if (!recordingRef.current) {
        animationFrameRef.current = null;
        return;
      }

      drawFrame();

      animationFrameRef.current =
        requestAnimationFrame(render);
    };

    animationFrameRef.current =
      requestAnimationFrame(render);
  }, [drawFrame, stopAnimation]);

  /**
   * ---------------------------------------------------------
   * Start recording
   * ---------------------------------------------------------
   */

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;

    const sourceStream = mediaStreamRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!sourceStream || !canvas || !video) {
      setError("Камера еще не готова");
      return;
    }

    try {
      /**
       * Если autoplay был заблокирован — здесь уже есть
       * пользовательский gesture.
       */
      try {
        await video.play();
      } catch {
        // continue, MediaRecorder may still work
      }

      const videoTracks =
        sourceStream.getVideoTracks();

      const audioTracks =
        sourceStream.getAudioTracks();

      if (!videoTracks.length) {
        throw new Error("Видеотрек отсутствует");
      }

      if (!audioTracks.length) {
        throw new Error("Аудиотрек отсутствует");
      }

      /**
       * Размер canvas задаем только перед записью.
       */
      canvas.width = VIDEO_SIZE;
      canvas.height = VIDEO_SIZE;

      /**
       * Первый кадр рисуем сразу.
       */
      drawFrame();

      /**
       * Canvas stream существует только во время записи.
       */
      const canvasStream =
        canvas.captureStream(FPS);

      const canvasVideoTrack =
        canvasStream.getVideoTracks()[0];

      if (!canvasVideoTrack) {
        throw new Error(
          "Не удалось создать видеопоток"
        );
      }

      const audioTrack = audioTracks[0];

      const recordingStream = new MediaStream([
        canvasVideoTrack,
        audioTrack,
      ]);

      recordingStreamRef.current = recordingStream;

      const mimeType = getSupportedMimeType();

      if (!mimeType) {
        throw new Error(
          "Этот браузер не поддерживает запись видео"
        );
      }

      chunksRef.current = [];

      const recorder = new MediaRecorder(
        recordingStream,
        {
          mimeType,
          videoBitsPerSecond: VIDEO_BITRATE,
          audioBitsPerSecond: AUDIO_BITRATE,
        }
      );

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error(
          "MediaRecorder error:",
          event
        );

        if (mountedRef.current) {
          setError("Ошибка во время записи");
        }
      };

      recorder.onstop = () => {
        stopAnimation();
        stopTimer();

        const chunks = chunksRef.current;

        /**
         * Закрываем только canvas stream.
         * Камера и микрофон должны продолжить жить,
         * чтобы пользователь мог сразу записать еще раз.
         */
        stopStream(recordingStreamRef.current);
        recordingStreamRef.current = null;

        if (!chunks.length) {
          if (mountedRef.current) {
            setError("Запись не содержит данных");
          }
          return;
        }

        const blob = new Blob(chunks, {
          type: mimeType,
        });

        if (!blob.size) {
          if (mountedRef.current) {
            setError("Получен пустой файл");
          }
          return;
        }

        const extension =
          getFileExtension(mimeType);

        const file = new File(
          [blob],
          `video-note-${Date.now()}.${extension}`,
          {
            type: mimeType,
            lastModified: Date.now(),
          }
        );

        chunksRef.current = [];

        if (mountedRef.current) {
          setIsRecording(false);
          setSeconds(0);
          onRecorded(file);
        }
      };

      /**
       * Небольшой timeslice.
       *
       * 1000ms достаточно стабильно для Safari/PWA
       * и не создает слишком много Blob.
       */
      recorder.start(1000);

      recordingRef.current = true;

      setIsRecording(true);
      setSeconds(0);
      setError(null);

      startCanvasLoop();

      const startedAt = Date.now();

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - startedAt) / 1000
        );

        if (!mountedRef.current) return;

        setSeconds(elapsed);

        if (elapsed >= maxDuration) {
          stopRecording();
        }
      }, 250);
    } catch (err: any) {
      console.error(
        "Start recording failed:",
        err
      );

      stopAnimation();
      stopTimer();

      stopStream(recordingStreamRef.current);
      recordingStreamRef.current = null;

      recordingRef.current = false;

      if (mountedRef.current) {
        setIsRecording(false);
        setError(
          err?.message ||
            "Не удалось начать запись"
        );
      }
    }
  }, [
    drawFrame,
    maxDuration,
    onRecorded,
    startCanvasLoop,
    stopAnimation,
    stopStream,
    stopTimer,
  ]);

  /**
   * ---------------------------------------------------------
   * Stop recording
   * ---------------------------------------------------------
   */

  const stopRecording = useCallback(() => {
    const recorder =
      mediaRecorderRef.current;

    recordingRef.current = false;

    stopAnimation();
    stopTimer();

    if (!recorder) {
      setIsRecording(false);
      return;
    }

    if (recorder.state === "recording") {
      try {
        /**
         * Последний кадр перед stop.
         */
        drawFrame();

        recorder.stop();
      } catch (err) {
        console.error(
          "Stop recording failed:",
          err
        );

        if (mountedRef.current) {
          setIsRecording(false);
        }
      }
    } else {
      setIsRecording(false);
    }
  }, [
    drawFrame,
    stopAnimation,
    stopTimer,
  ]);

  /**
   * ---------------------------------------------------------
   * Cancel
   * ---------------------------------------------------------
   */

  const cancel = useCallback(() => {
    recordingRef.current = false;

    stopAnimation();
    stopTimer();

    const recorder =
      mediaRecorderRef.current;

    if (recorder) {
      try {
        recorder.onstop = null;
        recorder.ondataavailable = null;

        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        // ignore
      }
    }

    mediaRecorderRef.current = null;

    stopStream(recordingStreamRef.current);
    recordingStreamRef.current = null;

    stopStream(mediaStreamRef.current);
    mediaStreamRef.current = null;

    chunksRef.current = [];

    onCancel();
  }, [
    onCancel,
    stopAnimation,
    stopStream,
    stopTimer,
  ]);

  /**
   * ---------------------------------------------------------
   * Visibility
   * ---------------------------------------------------------
   *
   * В PWA пользователь может свернуть приложение.
   *
   * Не пытаемся продолжать запись при hidden —
   * Safari может заморозить JS/video.
   */

  useEffect(() => {
    const handleVisibility = () => {
      if (
        document.visibilityState === "hidden" &&
        recordingRef.current
      ) {
        stopRecording();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [stopRecording]);

  /**
   * ---------------------------------------------------------
   * UI
   * ---------------------------------------------------------
   */

  const progress =
    maxDuration > 0
      ? Math.min(
          (seconds / maxDuration) * 100,
          100
        )
      : 0;

  const time =
    `${Math.floor(seconds / 60)}:` +
    String(seconds % 60).padStart(2, "0");

  const maxTime =
    `${Math.floor(maxDuration / 60)}:` +
    String(maxDuration % 60).padStart(2, "0");

  const canSwitchCamera =
    hasFrontCamera && hasBackCamera;

  /**
   * ---------------------------------------------------------
   * Error screen
   * ---------------------------------------------------------
   */

  if (error) {
    return (
      <div className="fixed inset-0 z-[300] bg-black flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <Camera
              size={24}
              className="text-red-400"
            />
          </div>

          <p className="text-sm text-white/80">
            {error}
          </p>

          <div className="mt-5 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                initialize();
              }}
              className="
                rounded-xl
                bg-white
                px-4
                py-2.5
                text-sm
                font-medium
                text-black
                transition
                active:scale-95
              "
            >
              Попробовать снова
            </button>

            <button
              type="button"
              onClick={cancel}
              className="
                rounded-xl
                bg-white/10
                px-4
                py-2.5
                text-sm
                text-white
                transition
                active:scale-95
              "
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  /**
   * ---------------------------------------------------------
   * Minimized
   * ---------------------------------------------------------
   */

  if (mode === "minimized") {
    return (
      <div
        className="
          fixed
          bottom-4
          left-3
          right-3
          z-[300]
          md:left-auto
          md:right-5
          md:w-[430px]
        "
      >
        <div
          className="
            flex
            items-center
            gap-3
            rounded-2xl
            border
            border-white/10
            bg-[#18181b]/95
            p-2.5
            shadow-2xl
            backdrop-blur-xl
          "
        >
          <button
            type="button"
            onClick={toggleMirror}
            className="
              relative
              h-14
              w-14
              shrink-0
              overflow-hidden
              rounded-xl
              bg-black
            "
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{
                transform: mirrored
                  ? "scaleX(-1)"
                  : undefined,
              }}
            />

            {isRecording && (
              <span
                className="
                  absolute
                  left-1.5
                  top-1.5
                  h-2
                  w-2
                  rounded-full
                  bg-red-500
                "
              />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums text-white">
                {time}
              </span>

              <span className="text-xs text-white/30">
                / {maxTime}
              </span>
            </div>

            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-red-500 transition-[width] duration-200"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canSwitchCamera && !isRecording && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={isSwitchingCamera}
                className="
                  rounded-lg
                  p-2
                  text-white/60
                  transition
                  hover:bg-white/10
                  hover:text-white
                  disabled:opacity-30
                "
              >
                <RotateCcw size={16} />
              </button>
            )}

            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                className="
                  rounded-lg
                  p-2
                  text-white/60
                  transition
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <Maximize2 size={16} />
              </button>
            )}

            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!isReady || isSwitchingCamera}
                className="
                  rounded-xl
                  bg-violet-500
                  px-3
                  py-2
                  text-xs
                  font-semibold
                  text-white
                  transition
                  active:scale-95
                  disabled:opacity-40
                "
              >
                Запись
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="
                  flex
                  items-center
                  gap-1.5
                  rounded-xl
                  bg-red-500
                  px-3
                  py-2
                  text-xs
                  font-semibold
                  text-white
                  transition
                  active:scale-95
                "
              >
                <Square
                  size={10}
                  fill="currentColor"
                />
                Стоп
              </button>
            )}

            <button
              type="button"
              onClick={cancel}
              className="
                rounded-lg
                p-2
                text-white/40
                transition
                hover:bg-red-500/10
                hover:text-red-400
              "
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={VIDEO_SIZE}
          height={VIDEO_SIZE}
          className="hidden"
        />
      </div>
    );
  }

  /**
   * ---------------------------------------------------------
   * Expanded
   * ---------------------------------------------------------
   */

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black p-4">
      <div className="flex w-full max-w-[520px] flex-col items-center">
        {/* Preview */}
        <div
          className="
            relative
            aspect-square
            w-full
            max-w-[460px]
            overflow-hidden
            rounded-[28px]
            bg-[#111]
            shadow-2xl
          "
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              transform: mirrored
                ? "scaleX(-1)"
                : undefined,
            }}
          />

          {/* recording canvas — hidden from UI */}
          <canvas
            ref={canvasRef}
            width={VIDEO_SIZE}
            height={VIDEO_SIZE}
            className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          />

          {/* Top bar */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <div
              className="
                rounded-full
                bg-black/40
                px-3
                py-1.5
                text-xs
                text-white/70
                backdrop-blur-md
              "
            >
              {facing === "user"
                ? "Фронтальная"
                : "Основная"}
            </div>

            {isRecording && (
              <div
                className="
                  flex
                  items-center
                  gap-2
                  rounded-full
                  bg-black/50
                  px-3
                  py-1.5
                  font-mono
                  text-xs
                  text-white
                  backdrop-blur-md
                "
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />

                {time}

                <span className="text-white/40">
                  / {maxTime}
                </span>
              </div>
            )}
          </div>

          {/* Mirror */}
          {!isRecording && (
            <button
              type="button"
              onClick={toggleMirror}
              className="
                absolute
                bottom-4
                left-4
                flex
                items-center
                gap-2
                rounded-full
                bg-black/45
                px-3
                py-2
                text-xs
                text-white/80
                backdrop-blur-md
                transition
                active:scale-95
              "
            >
              <span>
                {mirrored ? "Зеркало" : "Оригинал"}
              </span>
            </button>
          )}

          {/* Loading */}
          {!isReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />

                <p className="mt-3 text-xs text-white/50">
                  Камера запускается…
                </p>
              </div>
            </div>
          )}

          {/* Progress */}
          {isRecording && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
              <div
                className="h-full bg-red-500 transition-[width] duration-200"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-6 flex w-full items-center justify-center gap-4">
          {/* Cancel */}
          <button
            type="button"
            onClick={cancel}
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-full
              bg-white/10
              text-white/70
              transition
              hover:bg-white/15
              active:scale-95
            "
          >
            <X size={20} />
          </button>

          {/* Camera */}
          <button
            type="button"
            onClick={switchCamera}
            disabled={
              !canSwitchCamera ||
              isRecording ||
              isSwitchingCamera
            }
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-full
              bg-white/10
              text-white/70
              transition
              hover:bg-white/15
              active:scale-95
              disabled:cursor-not-allowed
              disabled:opacity-25
            "
            title={
              canSwitchCamera
                ? "Сменить камеру"
                : "Доступна одна камера"
            }
          >
            <RotateCcw
              size={20}
              className={
                isSwitchingCamera
                  ? "animate-spin"
                  : ""
              }
            />
          </button>

          {/* Record */}
          {!isRecording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={!isReady}
              className="
                flex
                h-[72px]
                w-[72px]
                items-center
                justify-center
                rounded-full
                bg-white
                shadow-xl
                shadow-black/30
                transition
                active:scale-95
                disabled:cursor-not-allowed
                disabled:opacity-40
              "
            >
              <span
                className="
                  h-5
                  w-5
                  rounded-full
                  bg-red-500
                "
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="
                flex
                h-[72px]
                w-[72px]
                items-center
                justify-center
                rounded-full
                bg-red-500
                shadow-xl
                shadow-red-500/20
                transition
                active:scale-95
              "
            >
              <span
                className="
                  h-6
                  w-6
                  rounded-md
                  bg-white
                "
              />
            </button>
          )}

          {/* Minimize */}
          <button
            type="button"
            onClick={onMinimize}
            disabled={isSwitchingCamera}
            className="
              flex
              h-12
              w-12
              items-center
              justify-center
              rounded-full
              bg-white/10
              text-white/70
              transition
              hover:bg-white/15
              active:scale-95
            "
          >
            <Minimize2 size={20} />
          </button>
        </div>

        {/* Hint */}
        <div className="mt-4 text-center">
          <p className="text-[11px] text-white/30">
            {isRecording
              ? "Нажмите кнопку, чтобы остановить"
              : "Тап по «Зеркало» меняет отражение"}
          </p>
        </div>
      </div>
    </div>
  );
}