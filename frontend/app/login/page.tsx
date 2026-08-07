"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";


const inputCls =
  "border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] focus:bg-white/10 transition-all";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: React.FormEvent) {
  e.preventDefault();
  setError("");

  // ✅ Обратные кавычки + переменная окружения, без http://
  const url =
    mode === "login"
      ? `${process.env.NEXT_PUBLIC_API_URL}/api/login`
      : `${process.env.NEXT_PUBLIC_API_URL}/api/register`;

  const body =
    mode === "login"
      ? { username, password }
      : { username, display_name: displayName, password };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) {
        setError("Слишком много попыток. Подождите 1 минуту.");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Ошибка");
      }
      return;
    }

    const data = await res.json();
    setToken(data.token);
    router.push("/");
  } catch {
    setError("Не удалось связаться с сервером. Попробуй ещё раз.");
  }
}

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
        <h1 className="font-logo text-5xl text-center mb-6 text-[#8b5cf6]">
          NEBULA
        </h1>

        <div className="flex border border-white/15 rounded-full overflow-hidden mb-6 bg-white/5">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 font-bold transition-all ${
              mode === "login" ? "bg-[#8b5cf6] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 py-2 font-bold transition-all ${
              mode === "register" ? "bg-[#8b5cf6] text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Отображаемое имя"
              required
              className={inputCls}
            />
          )}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username (латиницей, без пробелов)"
            required
            className={inputCls}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            required
            className={inputCls}
          />
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}
          <button className="border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2  transition-all">
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </div>
  );
}