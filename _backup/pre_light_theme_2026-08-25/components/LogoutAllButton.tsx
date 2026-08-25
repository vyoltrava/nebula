"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getToken, clearToken } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

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
    <Button
      variant="danger"
      icon={LogOut}
      loading={loading}
      onClick={handleClick}
      disabled={loading}
      className="w-full"
    >
      {loading ? "Выходим..." : "Выйти со всех устройств"}
    </Button>
  );
}