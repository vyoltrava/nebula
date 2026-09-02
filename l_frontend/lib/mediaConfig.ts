/**
 * mediaConfig.ts — конфигурация записи и предпросмотра медиа (БЛОК 1 + БЛОК 5).
 *
 * ⚠️ Веб-трансляция ТЗ «H.264 Baseline + 2 Mbps + prepareAsync()»:
 *  - Профиль Baseline нельзя задать из JS; Safari/Google используют совместимый
 *    realtime-профиль (Baseline/Constrained-Baseline) по умолчанию — выбираем
 *    именно H.264-кодек через feature-detection `MediaRecorder.isTypeSupported`.
 *  - Битрейт задаётся `videoBitsPerSecond` прямо в MediaRecorderOptions (решает
 *    «большой файл / вылеты» за счёт аппаратного энкодера браузера).
 *  - `prepareAsync()` → веб-аналог: `prepareVideoPreview()` достаёт первый I-frame
 *    (poster) + метаданные, а `<video preload="auto">` кеширует звук в фоне.
 */
export const RECORDING_BITRATE = 2_000_000; // 2 Mbps (БЛОК 1: 1.5–2 Mbps)
export const AUDIO_BITRATE = 64_000; // 64 kbps opus — достаточно для речи
export const MAX_RECORDING_SEC = 60; // БЛОК 5: жёсткий лимит 60.000 мс
export const WARNING_SEC = 59; // БЛОК 5: «Осталась 1 секунда»

// Квадратный формат «как в Stories», ограниченный FPS → малый размер файла.
export const VIDEO_CONSTRAINTS = {
  width: { ideal: 720, max: 720 },
  height: { ideal: 720, max: 720 },
  frameRate: { ideal: 24, max: 30 },
} as const;

export const AUDIO_CONSTRAINTS = {
  channelCount: 1,
  sampleRate: 48000, // Opus предпочитает 48 kHz
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
} as const;

/** Чистый выбор поддерживаемого MIME по приоритету (тестируемо без window). */
export function pickSupportedMime(
  candidates: string[],
  isTypeSupported: (mime: string) => boolean
): string | null {
  return candidates.find((m) => isTypeSupported(m)) ?? null;
}

/** Предпочитаем H.264 (Baseline) для максимальной кросс-платформенной совместимости. */
const VIDEO_MIME_PRIORITY = [
  "video/mp4;codecs=h264,aac", // Safari: H.264 Constrained-Baseline + AAC
  "video/webm;codecs=h264,opus", // Android Chrome: H.264 + Opus
  "video/webm;codecs=h264",
  // Fallbacks (VP8/VP9) — только если H.264 недоступен
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

const AUDIO_MIME_PRIORITY = [
  "audio/mp4;codecs=mp4a.42", // AAC
  "audio/webm;codecs=opus",
  "audio/webm;codecs=vorbis",
  "audio/wav",
] as const;

let cachedMime: Partial<Record<"video" | "audio", string>> = {};

export function selectRecordingMimeType(isAudioOnly = false): string {
  const key = isAudioOnly ? "audio" : "video";
  const cached = cachedMime[key];
  if (cached !== undefined) return cached;
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    const fallback = isAudioOnly ? "audio/webm" : "video/webm";
    cachedMime[key] = fallback;
    return fallback;
  }
  const list = isAudioOnly ? [...AUDIO_MIME_PRIORITY] : [...VIDEO_MIME_PRIORITY];
  const picked = pickSupportedMime(list, (m) => MediaRecorder.isTypeSupported(m)) ?? (isAudioOnly ? "audio/webm" : "video/webm");
  cachedMime[key] = picked;
  return picked;
}

export function isH264Mime(mime: string): boolean {
  return /h264/i.test(mime) || /^video\/mp4/i.test(mime);
}

export function fileExtensionForMime(mime: string): "mp4" | "webm" {
  return /^video\/mp4/i.test(mime) || /^audio\/mp4/i.test(mime) ? "mp4" : "webm";
}

export function recordingOptions(isAudioOnly = false): MediaRecorderOptions {
  const mimeType = selectRecordingMimeType(isAudioOnly);
  return isAudioOnly
    ? { mimeType, audioBitsPerSecond: AUDIO_BITRATE }
    : { mimeType, videoBitsPerSecond: RECORDING_BITRATE, audioBitsPerSecond: AUDIO_BITRATE };
}

/** Кеш постеров по src: { poster, duration, width, height }. */
const posterCache = new Map<string, VideoPreview>();

export interface VideoPreview {
  poster: string; // dataURL первого ключевого кадра (I-frame)
  duration: number;
  width: number;
  height: number;
}

/**
 * БЛОЧК 1 (preload): имитирует prepareAsync()/load() — извлекает ТОЛЬКО первый
 * ключевой кадр (I-frame) для мгновенного превью + метаданные. Полная загрузка
 * (preload="auto") идёт в фоне через сам <video>-элемент.
 */
export function prepareVideoPreview(src: string): Promise<VideoPreview> {
  const cached = posterCache.get(src);
  if (cached) return Promise.resolve(cached);
  if (typeof document === "undefined" || !src) {
    return Promise.resolve({ poster: "", duration: 0, width: 0, height: 0 });
  }
  return new Promise((resolve) => {
    let settled = false;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true; // без звука гарантировать autoplay policy для отрисовки кадра
    video.src = src;

    const onMeta = () => {
      if (settled) return;
      settled = true;
      let poster = "";
      try {
        const canvas = document.createElement("canvas");
        const w = 64,
          h = 64;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx && video.videoWidth) {
          ctx.drawImage(video, 0, 0, w, h);
          poster = canvas.toDataURL("image/webp", 0.7);
        }
      } catch {
        poster = "";
      }
      const preview: VideoPreview = {
        poster,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      };
      posterCache.set(src, preview);
      resolve(preview);
    };

    video.addEventListener("loadeddata", onMeta, { once: true });
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", () => {
      if (settled) return;
      settled = true;
      resolve({ poster: "", duration: 0, width: 0, height: 0 });
    });
    video.load();
  });
}
