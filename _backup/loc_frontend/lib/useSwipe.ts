"use client";
import { useRef, useCallback, useState } from "react";

export type SwipeDirection = "left" | "right" | "none";

interface SwipeConfig {
  /** Минимальное расстояние для определения свайпа (px) */
  threshold?: number;
  /** Максимальное расстояние свайпа (px) */
  maxOffset?: number;
  /** Сопротивление после достижения maxOffset (0-1, меньше = сильнее) */
  resistance?: number;
  /** Callback при завершении свайпа вправо */
  onSwipeRight?: () => void;
  /** Callback при завершении свайпа влево */
  onSwipeLeft?: () => void;
  /** Callback при каждом движении */
  onMove?: (offset: number, direction: SwipeDirection) => void;
  /** Блокировать вертикальный скролл при горизонтальном свайпе */
  preventVerticalScroll?: boolean;
  /** Минимальное горизонтальное движение чтобы считать свайпом (а не тапом) */
  minHorizontalDelta?: number;
}

interface SwipeState {
  /** Текущее смещение в пикселях */
  offset: number;
  /** Направление текущего свайпа */
  direction: SwipeDirection;
  /** Идёт ли свайп прямо сейчас */
  isSwiping: boolean;
}

export function useSwipe(config: SwipeConfig = {}) {
  const {
    threshold = 80,
    maxOffset = 120,
    resistance = 0.3,
    onSwipeRight,
    onSwipeLeft,
    onMove,
    preventVerticalScroll = true,
    minHorizontalDelta = 10,
  } = config;

  const [state, setState] = useState<SwipeState>({
    offset: 0,
    direction: "none",
    isSwiping: false,
  });

  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const isSwipingRef = useRef(false);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);

  const reset = useCallback(() => {
    setState({ offset: 0, direction: "none", isSwiping: false });
    isSwipingRef.current = false;
    directionLocked.current = null;
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number) => {
    startX.current = clientX;
    startY.current = clientY;
    currentX.current = clientX;
    directionLocked.current = null;
    isSwipingRef.current = false;
  }, []);

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      const deltaX = clientX - startX.current;
      const deltaY = clientY - startY.current;

      // Определяем направление при первом существенном движении
      if (!directionLocked.current) {
        if (Math.abs(deltaX) > minHorizontalDelta || Math.abs(deltaY) > minHorizontalDelta) {
          directionLocked.current = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
        } else {
          return;
        }
      }

      // Если свайп вертикальный — не обрабатываем
      if (directionLocked.current === "vertical") return;

      isSwipingRef.current = true;

      // Применяем сопротивление за пределами maxOffset
      let offset = deltaX;
      if (Math.abs(deltaX) > maxOffset) {
        const excess = Math.abs(deltaX) - maxOffset;
        const sign = deltaX > 0 ? 1 : -1;
        offset = (maxOffset + excess * resistance) * sign;
      }

      const direction: SwipeDirection =
        offset > minHorizontalDelta ? "right" : offset < -minHorizontalDelta ? "left" : "none";

      setState({ offset, direction, isSwiping: true });
      onMove?.(offset, direction);
    },
    [maxOffset, resistance, minHorizontalDelta, onMove]
  );

  const handleEnd = useCallback(() => {
    if (!isSwipingRef.current) {
      reset();
      return;
    }

    const finalOffset = state.offset;

    if (finalOffset >= threshold) {
      onSwipeRight?.();
    } else if (finalOffset <= -threshold) {
      onSwipeLeft?.();
    }

    reset();
  }, [state.offset, threshold, onSwipeRight, onSwipeLeft, reset]);

  // Обработчики для мыши
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Только левая кнопка мыши
      if (e.button !== 0) return;
      handleStart(e.clientX, e.clientY);

      const handleMouseMove = (ev: MouseEvent) => {
        handleMove(ev.clientX, ev.clientY);
        if (preventVerticalScroll && isSwipingRef.current) {
          ev.preventDefault();
        }
      };

      const handleMouseUp = () => {
        handleEnd();
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [handleStart, handleMove, handleEnd, preventVerticalScroll]
  );

  // Обработчики для тача
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    },
    [handleStart]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  return {
    ...state,
    isSwiping: isSwipingRef.current,
    handlers: {
      onMouseDown,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    reset,
  };
}