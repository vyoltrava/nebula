/**
 * useRecordingTimer.ts - БЛОК 5: жёсткий таймер записи 60 секунд.
 *
 * Надёжная реализация на главном потоке (setInterval по Date.now()).
 * Web Worker-вариант оказался нестабилен в некоторых сборках Next/CSP,
 * поэтому считаем по абсолютному времени: подвисания главного потока
 * почти не влияют на точность (запаздывание компенсируется по Date.now()).
 * Состояния: warning (59 с) -> "Осталась 1 секунда", finished (60.000 мс) -> auto-send.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type TimerStatus = "idle" | "running" | "warning" | "finished";

export interface TimerSnapshot {
  seconds: number;
  millis: number;
  status: TimerStatus;
}

/** Чистая функция расчёта состояния таймера (тестируется без window). */
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

export function useRecordingTimer(opts: UseRecordingTimerOpts = {}): RecordingTimerApi {
  const { maxDurationSec = 60, onWarning, onLimit, onTick } = opts;
  const [state, setState] = useState<TimerSnapshot>({ seconds: 0, millis: 0, status: "idle" });

  const startAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxRef = useRef(maxDurationSec);
  maxRef.current = maxDurationSec;

  // Свежие колбэки без пересоздания интервала при каждом рендере.
  const cbRef = useRef({ onWarning, onLimit, onTick });
  cbRef.current = { onWarning, onLimit, onTick };

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setState({ seconds: 0, millis: 0, status: "idle" });
  }, [stop]);

  const start = useCallback(() => {
    stop(); // идемпотентно: гасим старый интервал
    startAtRef.current = Date.now();
    setState({ seconds: 0, millis: 0, status: "running" });

    const tick = () => {
      const snap = computeTimerState(Date.now() - startAtRef.current, maxRef.current);
      setState(snap);
      cbRef.current.onTick?.(snap.seconds);
      if (snap.status === "warning") {
        cbRef.current.onWarning?.();
      } else if (snap.status === "finished") {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        cbRef.current.onLimit?.();
      }
    };

    tick(); // сразу показать 0:00
    intervalRef.current = setInterval(tick, 200);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    seconds: state.seconds,
    status: state.status,
    isWarning: state.status === "warning",
    start,
    stop,
    reset,
  };
}
