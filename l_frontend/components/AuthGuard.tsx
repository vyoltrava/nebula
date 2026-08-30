"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";

// Страницы, которые доступны без авторизации
const PUBLIC_PATHS = ["/login", "/register"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

        if (!token && !isPublic) {
      // Нет токена и страница защищённая — на логин
      router.replace("/login");
      return;
    }

    // Если есть токен и страница публична — на главную
    if (token && isPublic) {
      router.replace("/");
      return;
    }

    // Если токен есть — проверяем его валидность через /api/me
    if (token && !isPublic) {
      apiFetch("/api/me")
        .then((res) => {
          if (!res.ok) {
            // Токен недействителен (истёк, отозван, 2FA) — выходим
            clearToken();
            router.replace("/login");
          } else {
            setChecked(true);
          }
        })
        .catch(() => {
          // Сетевая/серверная ошибка (напр. рестарт Render / офлайн) —
          // НЕ сносим аккаунт: даём приложению открыться, при восстановлении
          // сети /api/me пройдёт. Иначе аккаунт удалялся бы просто из-за дауна.
          setChecked(true);
        });
    } else {
      setChecked(true);
    }
  }, [pathname, router]);

  // Пока проверяем — показываем загрузку (чтобы не мелькали защищённые данные)
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper dark:bg-[#0f0f10]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
          <p className="text-white/60 text-sm">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}