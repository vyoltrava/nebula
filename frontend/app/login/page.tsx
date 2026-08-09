"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";

const inputCls =
  "border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-purple-400/50 focus:bg-white/10 transition-all";

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

    const url = mode === "login" ? "/api/login" : "/api/register";
    const body =
      mode === "login"
        ? { username, password }
        : { username, display_name: displayName, password };

    const res = await fetch(`http://localhost:8000${url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.detail ?? "Ошибка");
      return;
    }

    const data = await res.json();
    setToken(data.token);
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
        <h1 className="font-logo text-5xl text-center mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
          NEBULA v 0.5
        </h1>

        <div className="flex border border-white/15 rounded-full overflow-hidden mb-6 bg-white/5">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 py-2 font-bold transition-all ${
              mode === "login" ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" : "text-white/60 hover:text-white"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 py-2 font-bold transition-all ${
              mode === "register" ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white" : "text-white/60 hover:text-white"
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
          {error && <p className="text-sm text-pink-400">{error}</p>}
          <button className="border border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-lg py-2 hover:shadow-lg hover:shadow-purple-500/30 transition-all">
            {mode === "login" ? "Войти" : "Создать аккаунт"}
          </button>
        </form>
      </div>
    </div>
  );
}