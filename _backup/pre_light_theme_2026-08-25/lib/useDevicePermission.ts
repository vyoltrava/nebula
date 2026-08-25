"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export type DeviceKind = "microphone" | "camera";
export type PermStatus = "granted" | "denied" | "prompt" | "unknown";

// iOS Safari не поддерживает permissions.query — запоминаем последний известный статус
function getStoredStatus(kind: DeviceKind): PermStatus {
  try {
    return (localStorage.getItem(`perm_${kind}`) as PermStatus) || "unknown";
  } catch {
    return "unknown";
  }
}

function setStoredStatus(kind: DeviceKind, status: PermStatus) {
  try {
    localStorage.setItem(`perm_${kind}`, status);
  } catch {}
}

export function useDevicePermission(kind: DeviceKind) {
  // На iOS сразу берём последний известный статус вместо "unknown"
  const [status, setStatus] = useState<PermStatus>(() => getStoredStatus(kind));
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

  // Обновляет статус через Permissions API
  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      // Fallback для iOS — оставляем сохранённый статус
      return;
    }
    try {
      // Очищаем предыдущий обработчик чтобы не было утечки
      if (permissionStatusRef.current) {
        permissionStatusRef.current.onchange = null;
      }

      const st = await navigator.permissions.query({ name: kind as PermissionName });
      permissionStatusRef.current = st;
      setStatus(st.state as PermStatus);
      setStoredStatus(kind, st.state as PermStatus);

      st.onchange = () => {
        setStatus(st.state as PermStatus);
        setStoredStatus(kind, st.state as PermStatus);
      };
    } catch {
      // Safari не поддерживает query для camera/mic — используем сохранённый
    }
  }, [kind]);

  // Фактическая проверка: пытаемся получить stream
  const verify = useCallback(async (): Promise<boolean> => {
    try {
      const constraints: MediaStreamConstraints =
        kind === "microphone" ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((t) => t.stop());
      setStatus("granted");
      setStoredStatus(kind, "granted");
      return true;
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
        setStatus("denied");
        setStoredStatus(kind, "denied");
      } else if (e?.name === "NotFoundError") {
        // Устройство физически отсутствует
        setStatus("unknown");
      }
      return false;
    }
  }, [kind]);

  // Запрашивает разрешение. true = доступ есть
  const request = useCallback(async (): Promise<boolean> => {
    return verify(); // verify и есть запрос + проверка
  }, [verify]);

  // Первичный запрос статуса
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 🔄 Автообновление при возврате на вкладку
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  // 🧹 Очистка onchange при размонтировании
  useEffect(() => {
    return () => {
      if (permissionStatusRef.current) {
        permissionStatusRef.current.onchange = null;
        permissionStatusRef.current = null;
      }
    };
  }, []);

  return { status, request, verify, refresh };
}