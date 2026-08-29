"use client";
import { useState, useEffect, useCallback } from "react";
import { getActiveAccount } from "@/lib/auth";

export type QuickReaction = { type: "emoji" | "sticker"; content: string; stickerId?: number };

export const EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥", "👏", "🎉", "✅", "❤️‍🔥"];

const keyForUser = (id: number | null) => `quick_reaction_${id ?? 0}`;

function readReaction(uid: number | null): QuickReaction | null {
  try {
    const raw = localStorage.getItem(keyForUser(uid));
    if (raw) return JSON.parse(raw) as QuickReaction;
    const legacy = localStorage.getItem("quick_reaction");
    if (legacy && uid != null) {
      localStorage.setItem(keyForUser(uid), legacy);
      localStorage.removeItem("quick_reaction");
      return JSON.parse(legacy) as QuickReaction;
    }
  } catch {}
  return null;
}

export function useQuickReaction() {
  const [reaction, setReaction] = useState<QuickReaction | null>(() => {
    if (typeof window === 'undefined') return null;
    return readReaction(getActiveAccount()?.userId ?? null);
  });

  const reload = useCallback(() => {
    const uid = getActiveAccount()?.userId ?? null;
    setReaction(readReaction(uid));
  }, []);

  useEffect(() => {
    const onAccounts = () => reload();
    window.addEventListener("accounts-changed", onAccounts);
    window.addEventListener("storage", onAccounts);
    return () => {
      window.removeEventListener("accounts-changed", onAccounts);
      window.removeEventListener("storage", onAccounts);
    };
  }, [reload]);

  const save = (r: QuickReaction) => {
    const uid = getActiveAccount()?.userId ?? null;
    setReaction(r);
    try { localStorage.setItem(keyForUser(uid), JSON.stringify(r)); } catch {}
  };

  const clear = () => {
    const uid = getActiveAccount()?.userId ?? null;
    setReaction(null);
    try { localStorage.removeItem(keyForUser(uid)); } catch {}
  };

  return { reaction, save, clear, EMOJIS };
}
