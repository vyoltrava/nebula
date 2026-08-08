"use client";
import { useEffect } from "react";
import { socket } from "@/lib/websocket";
import { getToken } from "@/lib/auth";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const token = getToken();
    if (token) {
      socket.connect(token);
    }
    return () => socket.disconnect();
  }, []);

  return <>{children}</>;
}