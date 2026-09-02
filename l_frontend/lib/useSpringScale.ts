/**
 * useSpringScale.ts — БЛОК 2: анимация масштабирования.
 *
 * Веб‑трансляция Reanimated 2 `withSpring({ damping: 12, stiffness: 100 })`:
 * решаем ОДУ масс‑пружины‑демпфира (semi‑implicit Euler) и применяем результат
 * ТОЛЬКО к `transform` через `requestAnimationFrame`. Поскольку `transform` —
 * композитное свойство, браузер рендерит кадр на Compositor‑потоке без
 * перерисовки контента (веб‑эквивалент `useNativeDriver: true`) → нет подвисаний.
 *
 * Точное масштабирование в 2.0 раза (scale 1 → 2 и обратно).
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface SpringOptions {
  stiffness?: number; // k, N/м  (Reanimated: 100)
  damping?: number; // c,  N·s/м (Reanimated: 12)
  mass?: number; // m, кг     (Reanimated: 1)
  restDelta?: number; // порог остановки
}

export interface SpringScaleApi {
  ref: (el: HTMLElement | null) => void;
  style: React.CSSProperties;
  scale: number;
  animateTo: (target: number) => void;
  reset: () => void;
}

export function useSpringScale(initial = 1, opts: SpringOptions = {}): SpringScaleApi {
  const { stiffness = 100, damping = 12, mass = 1, restDelta = 0.001 } = opts;

  const nodeRef = useRef<HTMLElement | null>(null);
  const physicsRef = useRef({ x: initial, v: 0, target: initial, raf: null as number | null });
  const [, version] = useState(0); // пробуждает React‑потребителей масштаба

  const apply = useCallback((v: number) => {
    const el = nodeRef.current;
    if (el) {
      // translateZ(0) добавляет слой в GPU → плавно, как native
      el.style.transform = `translateZ(0) scale(${v})`;
    }
    physicsRef.current.x = v;
  }, []);

  const setRef = useCallback(
    (el: HTMLElement | null) => {
      nodeRef.current = el;
      if (el) {
        el.style.willChange = "transform";
        el.style.transition = "none";
        el.style.transform = `translateZ(0) scale(${initial})`;
      }
      physicsRef.current = { x: initial, v: 0, target: initial, raf: null };
      apply(initial);
    },
    [initial, apply]
  );

    const animateTo = useCallback(
    (target: number) => {
      const s = physicsRef.current;
      s.target = target;
      if (Math.abs(s.x - target) < restDelta && Math.abs(s.v) < 0.02) {
        apply(target);
        version((n) => n + 1);
        return;
      }
      if (s.raf === null) {
        let lastTs = 0;
        const loop = (ts: number) => {
          const dt = lastTs ? (ts - lastTs) / 1000 : 1 / 60;
          lastTs = ts;
          const step = Math.min(dt, 0.04); // стабильность на долгих кадрах
          // semi-implicit Euler: a → v → x  (масса‑пружина‑демпфир)
          const a = (-stiffness * (s.x - s.target) - damping * s.v) / mass;
          let v = s.v + a * step;
          let x = s.x + v * step;
          const nearTarget = Math.abs(x - s.target) < restDelta && Math.abs(v) < 0.02;
          if (nearTarget) {
            x = s.target;
            v = 0;
          }
          s.x = x;
          s.v = v;
          apply(x);
          if (nearTarget) {
            s.raf = null;
            version((n) => n + 1);
          } else {
            s.raf = requestAnimationFrame(loop);
          }
        };
        s.raf = requestAnimationFrame(loop);
      }
    },
    [stiffness, damping, mass, restDelta, apply]
  );

  const reset = useCallback(() => {
    animateTo(initial);
  }, [animateTo, initial]);

  // остановить анимацию при размонтировании
  useEffect(
    () => () => {
      if (physicsRef.current.raf) {
        cancelAnimationFrame(physicsRef.current.raf);
        physicsRef.current.raf = null;
      }
    },
    []
  );

    return {
    ref: setRef,
    // transform управляется ТОЛЬКО через ref (DOM) в rAF — React не должен
    // перезаписывать его stale‑значением из render. willChange даёт слой в GPU.
    style: { willChange: "transform" } as React.CSSProperties,
    scale: physicsRef.current.x,
    animateTo,
    reset,
  };
}
