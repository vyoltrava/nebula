"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getToken, clearToken } from "@/lib/auth";

export function LogoutAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Выйти со всех устройств? Тебе придётся войти заново.")) return;
    setLoading(true);
    const token = getToken();
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/logout-all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
    clearToken();
    router.push("/login");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 transition-all font-semibold text-sm disabled:opacity-50"
    >
      <LogOut size={16} />
      {loading ? "Выходим..." : "Выйти со всех устройств"}
    </button>
  );
}