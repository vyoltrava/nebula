"use client";

/**
 * Nebula: /nebula-profile теперь редирект на ЕДИНУЮ страницу профиля
 * /nebula-user/{username} (Задача 3: объединение «мой профиль» и «профиль другого»).
 * Редактирование (аватар, обложка, имя, био) и быстрые действия доступны
 * на единой странице, когда профиль свой.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getActiveAccount } from "@/lib/auth";

export default function NebulaProfileRedirect() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    // 1) из кеша активного аккаунта
    const acc = getActiveAccount();
    if (acc?.username) { setUsername(acc.username); return; }
    // 2) fallback: /api/me
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.username) setUsername(data.username);
        else router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (username) router.replace(`/nebula-user/${username}`);
  }, [username, router]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#17171b] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
