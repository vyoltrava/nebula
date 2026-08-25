"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getToken } from "@/lib/auth";

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
    } else if (token && isPublic) {
      // Есть токен и страница логина — на главную
      router.replace("/");
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