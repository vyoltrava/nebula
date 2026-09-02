/**
 * useRecordingTimer.ts — БЛОК 5: жёсткий таймер записи 60 секунд.
 *
 * Веб‑трансляция «таймер на уровне нативного модуля, а не JS‑таймеры»:
 * счётчик работает в Web Worker‑е (отдельный поток), поэтому его отметки
 * не страдают от подвисаний главного потока. Worker постит:
 *   • «warning» — в 59‑й секунде  → «Осталась 1 секунда»
 *   • «stop»     — ровно в 60.000 мс → авто‑остановка + отправка в обработку
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TimerStatus = "idle" | "running" | "warning" | "finished";

export interface TimerSnapshot {
  seconds: number;
  millis: number;
  status: TimerStatus;
}

/** Чистая функция расчёта состояния таймера (тестируется без worker/window). */
export function computeTimerState(
  elapsedMs: number,
  maxDurationSec: number
): TimerSnapshot {
  const limitMs = maxDurationSec * 1000;
  if (elapsedMs >= limitMs) {
    return { seconds: maxDurationSec, millis: limitMs, status: "finished" };
  }
  if (elapsedMs >= (maxDurationSec - 1) * 1000) {
    return { seconds: maxDurationSec - 1, millis: elapsedMs, status: "warning" };
  }
  const seconds = Math.floor(elapsedMs / 1000);
  return { seconds, millis: elapsedMs, status: "running" };
}

export interface UseRecordingTimerOpts {
  maxDurationSec?: number;
  onWarning?: () => void;
  onLimit?: () => void;
  onTick?: (seconds: number) => void;
}

export interface RecordingTimerApi {
  seconds: number;
  status: TimerStatus;
  isWarning: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

// Код воркера как строка → Blob URL (не требует отдельного файла/лоудера).
const WORKER_SOURCE = `
var startedAt = 0;
var maxMs = 60000;
var intervalId = 0;
var warned = false;
var stopped = false;

function tick() {
  if (stopped) return;
  var elapsed = Date.now() - startedAt;
  if (elapsed >= maxMs) {
    self.postMessage({ type: 'stop', seconds: Math.round(maxMs / 1000) });
    cleanup();
    return;
  }
  var sec = Math.floor(elapsed / 1000);
  var isWarning = elapsed >= (maxMs - 1000);
  if (isWarning && !warned) {
    warned = true;
    self.postMessage({ type: 'warning', seconds: sec });
  } else if (!isWarning) {
    self.postMessage({ type: 'tick', seconds: sec, millis: elapsed });
  }
}

function cleanup() {
  if (intervalId) { clearInterval(intervalId); intervalId = 0; }
}

self.onmessage = function (e) {
  var data = e.data || {};
  if (data.type === 'start') {
    maxMs = (data.maxDurationSec || 60) * 1000;
    startedAt = Date.now();
    warned = false;
    stopped = false;
    if (!intervalId) intervalId = setInterval(tick, 200);
  } else if (data.type === 'stop') {
    cleanup();
    stopped = true;
    if (typeof close === 'function') close();
  }
};
`;

function createWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL === "undefined") {
    return null;
  }
    try {
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return worker;
  } catch {
    return null;
  }
}

/**
 * Хук с надёжным fallback‑ом: если Web Worker недоступен (SSR/старый браузер),
 * работает через основной поток `setInterval`, но логика состояний та же.
 */
export function useRecordingTimer(opts: UseRecordingTimerOpts = {}): RecordingTimerApi {
  const { maxDurationSec = 60, onWarning, onLimit, onTick } = opts;
  const [state, setState] = useState<TimerSnapshot>({ seconds: 0, millis: 0, status: "idle" });

  const workerRef = useRef<Worker | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRef = useRef(maxDurationSec);
  maxRef.current = maxDurationSec;

  const stopWorker = useCallback(() => {
    if (workerRef.current) {
      try { workerRef.current.postMessage({ type: "stop" }); } catch {}
      try { workerRef.current.terminate(); } catch {}
      workerRef.current = null;
    }
  }, []);

  const stopFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    stopWorker();
    stopFallback();
  }, [stopWorker, stopFallback]);

  const reset = useCallback(() => {
    stop();
    setState({ seconds: 0, millis: 0, status: "idle" });
  }, [stop]);

  const start = useCallback(() => {
    reset();
    const worker = createWorker();
    if (worker) {
      worker.onmessage = (e: MessageEvent) => {
        const { type, seconds, millis } = e.data as {
          type: string;
          seconds?: number;
          millis?: number;
        };
        if (type === "tick" || type === "warning") {
          const sec = typeof seconds === "number" ? seconds : 0;
          setState({
            seconds: sec,
            millis: millis ?? sec * 1000,
            status: type === "warning" ? "warning" : "running",
          });
          onTick?.(sec);
          if (type === "warning") onWarning?.();
        } else if (type === "stop") {
          setState({ seconds: maxRef.current, millis: maxRef.current * 1000, status: "finished" });
          onLimit?.();
        }
      };
      worker.postMessage({ type: "start", maxDurationSec });
      workerRef.current = worker;
    } else {
      // Fallback: основной поток (редко, но гарантирует работу)
      const startAt = Date.now();
      const interval = setInterval(() => {
        const snap = computeTimerState(Date.now() - startAt, maxRef.current);
        setState(snap);
        onTick?.(snap.seconds);
        if (snap.status === "warning") {
          onWarning?.();
        } else if (snap.status === "finished") {
          stopFallback();
          onLimit?.();
        }
      }, 200);
      fallbackRef.current = interval;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDurationSec, onWarning, onLimit, onTick, reset, stopWorker, stopFallback]);

  useEffect(
    () => () => {
      stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return {
    seconds: state.seconds,
    status: state.status,
    isWarning: state.status === "warning",
    start,
    stop,
    reset,
  };
}
