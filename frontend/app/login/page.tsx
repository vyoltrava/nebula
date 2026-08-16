"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";
import { ShieldCheck, X } from "lucide-react";

const inputCls =
  "border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] focus:bg-white/10 transition-all";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  // 🆕 2FA STATE
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const [twoFACode, setTwoFACode] = useState("");
  const [loading2FA, setLoading2FA] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

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

      // 🆕 Если требуется 2FA — показываем форму кода
      if (data.requires_2fa) {
        setRequires2FA(true);
        setPendingUserId(data.user_id);
        return;
      }

      // Обычный логин без 2FA
      setToken(data.token);
      sessionStorage.setItem("justLoggedIn", "1");
      router.push("/");
    } catch {
      setError("Не удалось связаться с сервером. Попробуй ещё раз.");
    }
  }

  // 🆕 Обработчик отправки 2FA кода
  async function submit2FA(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading2FA(true);

    try {
      const form = new FormData();
      form.append("user_id", String(pendingUserId));
      form.append("code", twoFACode);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/login/2fa`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? "Неверный код 2FA");
        setLoading2FA(false);
        return;
      }

      const data = await res.json();
      setToken(data.token);
      sessionStorage.setItem("justLoggedIn", "1");
      router.push("/");
    } catch {
      setError("Не удалось связаться с сервером");
      setLoading2FA(false);
    }
  }

  // 🆕 Сброс к обычной форме логина
  function cancel2FA() {
    setRequires2FA(false);
    setPendingUserId(null);
    setTwoFACode("");
    setError("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
        <h1 className="font-logo text-5xl text-center mb-6 text-[#8b5cf6]">
          trelod
        </h1>

        {/* 🆕 ФОРМА 2FA */}
        {requires2FA ? (
          <form onSubmit={submit2FA} className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldCheck size={24} className="text-[#8b5cf6]" />
              <h2 className="text-lg font-bold text-white">Двухфакторная аутентификация</h2>
            </div>

            <p className="text-sm text-white/60 text-center mb-2">
              Введите 6-значный код из Google Authenticator<br />
              или резервный код
            </p>

            <input
              value={twoFACode}
              onChange={(e) =>
                setTwoFACode(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="000000"
              required
              autoFocus
              autoComplete="off"
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono py-3`}
            />

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading2FA || !twoFACode}
              className="border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#7c3aed]"
            >
              {loading2FA ? "Проверка..." : "Войти"}
            </button>

            <button
              type="button"
              onClick={cancel2FA}
              className="flex items-center justify-center gap-1 text-white/50 hover:text-white text-sm py-2 transition-colors"
            >
              <X size={14} />
              Назад к входу
            </button>
          </form>
        ) : (
          /* 🆕 ОБЫЧНАЯ ФОРМА ЛОГИНА/РЕГИСТРАЦИИ */
          <>
            <div className="flex border border-white/15 rounded-full overflow-hidden mb-6 bg-white/5">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 py-2 font-bold transition-all ${
                  mode === "login"
                    ? "bg-[#8b5cf6] text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                Вход
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 py-2 font-bold transition-all ${
                  mode === "register"
                    ? "bg-[#8b5cf6] text-white"
                    : "text-white/60 hover:text-white"
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
              <button className="border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2 transition-all hover:bg-[#7c3aed]">
                {mode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}