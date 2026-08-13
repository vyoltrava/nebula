"use client";
import { useCallback, useEffect, useState } from "react";

export type DeviceKind = "microphone" | "camera";
export type PermStatus = "granted" | "denied" | "prompt" | "unknown";

export function useDevicePermission(kind: DeviceKind) {
  const [status, setStatus] = useState<PermStatus>("unknown");

  const refresh = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      setStatus("unknown");
      return;
    }
    try {
      const st = await navigator.permissions.query({ name: kind as PermissionName });
      setStatus(st.state as PermStatus);
      st.onchange = () => setStatus(st.state as PermStatus);
    } catch {
      // Safari не поддерживает query для camera/mic — fallback
      setStatus("unknown");
    }
  }, [kind]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Запрашивает разрешение ОДИН раз. true = доступ есть */
  const request = useCallback(async (): Promise<boolean> => {
    try {
      const constraints = kind === "microphone" ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((t) => t.stop()); // сразу отпускаем устройство
      setStatus("granted");
      return true;
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") {
        setStatus("denied");
      }
      return false;
    }
  }, [kind]);

  return { status, request, refresh };
}