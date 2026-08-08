export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

import { clearCachedUser } from "./authCache";

export function clearToken() {
  localStorage.removeItem("token");
  clearCachedUser();
}