"use client";
import { useEffect, useRef, useState } from "react";
import { computeAmplitudeEnvelope, rmsAmplitude, smoothEnvelope } from "@/lib/audioEnvelope";

export interface SineWaveformProps {
  /** src аудио (для вычисления статической огибающей). */
  src: string;
  /** Ref на AnalyserNode глобального плеера — живая громкость во время воспроизведения. */
  analyserRef?: React.RefObject<AnalyserNode>;
  playing: boolean;
  /** Позиция воспроизведения 0..1 (playhead). */
  progress?: number;
  /** Цвет волны. */
  color?: string;
  /** Высота волны в пикселях. */
  height?: number;
  className?: string;
}

const envelopeCache = new Map<string, Float32Array>();
const BINS = 64; // разрешение огибающей

export function SineWaveform({
  src,
  analyserRef,
  playing,
  progress = 0,
  color = "#8b5cf6",
  height = 28,
  className = "",
}: SineWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserBufRef = useRef<Uint8Array | null>(null);
  const envRef = useRef<Float32Array | null>(null);
  const phaseRef = useRef(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: height });
  const [ready, setReady] = useState(false);

  // 1) Статическая огибающая громкости (max‑hold на бин), кэшируется по src.
  useEffect(() => {
    if (!src || typeof window === "undefined") return;
    if (envelopeCache.has(src)) {
      envRef.current = envelopeCache.get(src)!;
      setReady(true);
      return;
    }
    let active = true;
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((decoded) => {
        if (!active) return;
        const raw = computeAmplitudeEnvelope(decoded, BINS);
        const sm = smoothEnvelope(raw, 5);
        envRef.current = sm;
        envelopeCache.set(src, sm);
        setReady(true);
        ac.close();
      })
      .catch(() => {
        if (!active) return;
        envRef.current = new Float32Array(BINS).fill(0.25); // плейсхолдер
        setReady(true);
      });
    return () => { active = false; };
  }, [src]);

  // 2. Буфер для AnalyserNode (time‑domain).
  useEffect(() => {
    const analyser = analyserRef?.current;
    if (!analyser) return;
    analyserBufRef.current = new Uint8Array(analyser.frequencyBinCount || 128);
  }, [analyserRef]);

  const measure = () => {
    const w = wrapRef.current?.clientWidth ?? 300;
    const h = height;
    sizeRef.current = { w, h };
    return { w, h };
  };

  // 3. Цикл рисования (rAF) — работает всегда, чтобы волна «дышала».
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const applySize = () => {
      const { w, h } = measure();
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    applySize();

    const analyser = analyserRef?.current ?? null;
    let last = 0;
    const draw = (ts: number) => {
      const delta = last ? (ts - last) / 1000 : 0;
      last = ts;
      if (canvas.width !== sizeRef.current.w * dpr || canvas.height !== sizeRef.current.h * dpr) {
        applySize();
      }
      drawWave(
        ctx,
        sizeRef.current.w,
        sizeRef.current.h,
        envRef.current,
        analyser,
        analyserBufRef.current,
        playing,
        phaseRef.current,
        color,
        progress
      );
      // медленный фазовый drift для эффекта «живого» дыхания
      phaseRef.current += delta * 0.15;
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, progress, src, color, height]);

  // ResizeObserver — пересчитывать размер.
  useEffect(() => {
    if (!wrapRef.current || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      sizeRef.current = { w: wrapRef.current?.clientWidth ?? sizeRef.current.w, h: height };
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [height]);

    return (
    <div ref={wrapRef} className={`relative w-full ${className}`} style={{ height }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] text-gray-400 dark:text-white/30">загрузка волны…</span>
        </div>
      )}
    </div>
  );
}

/** RMS из AnalyserNode (0..1) — интенсивность звука в текущий момент. */
function liveGain(analyser: AnalyserNode | null, buf: Uint8Array | null): number {
  if (!analyser || !buf) return 0;
  try {
    analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>);
    return rmsAmplitude(buf);
  } catch {
    return 0;
  }
}

/** Амплитуда колонки x из 0..W: огибающая или плейсхолдер‑синус. */
function sampleAmplitude(x: number, W: number, env: Float32Array | null): number {
  if (env && env.length) {
    const idx = Math.min(env.length - 1, Math.floor((x / W) * env.length));
    return env[idx];
  }
  const phase = (x / W) * Math.PI * 4;
  return 0.45 + 0.35 * Math.sin(phase);
}

/**
 * Одна НЕПРЕРЫВНАЯ кривая (Path2D), симметричная вверх И вниз от центра,
 * построенная квадратичной (quadratic) интерполяцией — S‑образная «петля».
 */
function drawWave(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  env: Float32Array | null,
  analyser: AnalyserNode | null,
  buf: Uint8Array | null,
  playing: boolean,
  _phase: number,
  color: string,
  progress: number
) {
  ctx.clearRect(0, 0, W, H);
  const centerY = H / 2;
  const bars = Math.max(24, Math.min(56, Math.floor(W / 8)));
  const slot = W / bars;
  const gap = Math.max(1, slot * 0.18);
  const barW = Math.max(1, slot - gap);
  const maxHalf = (H * 0.88) / 2;

  // живой множитель громкости (0..1) при воспроизведении
  const live = playing ? liveGain(analyser, buf) : 0;
  const ampScale = 0.4 + 0.6 * live;

  const playX = W * Math.min(1, Math.max(0, progress));

  for (let i = 0; i < bars; i++) {
    const cx = i * slot + slot / 2;
    if (cx > W) break;
    let amp = sampleAmplitude(cx, W, env);
    amp = Math.max(0.06, amp * ampScale);
    const half = Math.max(1, amp * maxHalf); // высота столбца от центра
    const x0 = cx - barW / 2;
    const top = centerY - half;
    const played = cx <= playX;

    ctx.fillStyle = played ? shade(color, 0.12) : withAlpha(color, 0.32);
    roundRectFill(ctx, x0, top, barW, half * 2, Math.min(barW / 2, half));
  }

  // тонкая линия-центр
  ctx.fillStyle = withAlpha(color, 0.14);
  ctx.fillRect(0, centerY - 0.5, W, 1);

  // playhead-метка
  if (progress > 0) {
    const px = W * Math.min(1, Math.max(0, progress));
    ctx.fillStyle = shade(color, 1.4);
    ctx.fillRect(px, 2, 2, H - 4);
  }
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

function shade(hex: string, n: number): string {
  const h = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, parseInt(h.slice(0, 2), 16) + Math.round(n * 24)));
  const g = Math.min(255, Math.max(0, parseInt(h.slice(2, 4), 16) + Math.round(n * 24)));
  const b = Math.min(255, Math.max(0, parseInt(h.slice(4, 6), 16) + Math.round(n * 24)));
  return `rgb(${r},${g},${b})`;
}
function withAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

