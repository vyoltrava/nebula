import { useSyncExternalStore } from "react";

export type SidebarSide = "right" | "left";

export const SIDEBAR_SIDE_KEY = "trelod_sidebar_side";
export const SIDEBAR_SIDE_CHANGE_EVENT = "sidebar-side-change";

export function getSidebarSide(): SidebarSide {
  if (typeof window === "undefined") return "right";
  return localStorage.getItem(SIDEBAR_SIDE_KEY) === "left" ? "left" : "right";
}

export function setSidebarSide(side: SidebarSide) {
  localStorage.setItem(SIDEBAR_SIDE_KEY, side);
  window.dispatchEvent(new CustomEvent(SIDEBAR_SIDE_CHANGE_EVENT, { detail: side }));
}

function subscribe(listener: () => void) {
  window.addEventListener(SIDEBAR_SIDE_CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(SIDEBAR_SIDE_CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSidebarSide(): SidebarSide {
  return useSyncExternalStore(subscribe, getSidebarSide, () => "right");
}
