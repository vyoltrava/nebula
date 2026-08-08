import { socket } from "@/lib/websocket"; // 🆕
import { clearCachedUser } from "./authCache";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
  socket.connect(token); // 🆕 подключаем WS сразу после логина
}

export function clearToken() {
  localStorage.removeItem("token");
  clearCachedUser();
  socket.disconnect(); // 🆕 отключаем WS при выходе
}