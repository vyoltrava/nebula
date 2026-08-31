"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setToken } from "@/lib/auth";
import { ShieldCheck, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/Button";

const inputCls =
  "border border-line dark:border-white/15 rounded-lg px-3 py-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] focus:bg-gray-100 dark:focus:bg-white/10 transition-all";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { t } = useI18n();

  // рџ”Ґ РРЎРџР РђР’Р›Р•РќРћ: храним user_id, а не temp_token
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempUserId, setTempUserId] = useState<number | null>(null);
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
        if (res.status === 429) setError(t("login.tooMany"));
        else {
          const data = await res.json().catch(() => null);
          setError(data?.detail ?? t("common.error"));
        }
        return;
      }

      const data = await res.json();

      if (data.requires_2fa) {
        setRequires2FA(true);
        setTempUserId(data.user_id); 
        return;
      }

      // рџ”Ґ ШАГ 1: Получаем токен
      const token = data.token;

      // рџ”Ґ ШАГ 2: Если бэкенд сразу отдал user, используем его. РРЅР°С‡Рµ запрашиваем /api/me
      let userData = data.user;
      if (!userData) {
        const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          userData = await meRes.json();
        } else {
          setError("Не удалось получить данные профиля");
          return;
        }
      }

      // рџ”Ґ ШАГ 3: Сохраняем и токен, и пользователя в мульти-аккаунт менеджер
      setToken(token, userData, { refreshToken: data.refresh_token });
      sessionStorage.setItem("justLoggedIn", "1");
      router.push("/");
      
    } catch (err) {
      console.error("Login error:", err);
      setError(t("login.serverError"));
    }
  }

  async function submit2FA(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading2FA(true);

    try {
      const form = new FormData();
      form.append("user_id", String(tempUserId!)); 
      form.append("code", twoFACode);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/login/2fa`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.detail ?? t("login.invalid2fa"));
        setLoading2FA(false);
        return;
      }

      const data = await res.json();
      const token = data.token;

      // рџ”Ґ Для 2FA тоже запрашиваем /api/me, чтобы гарантированно получить актуальные данные
      const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (meRes.ok) {
        const userData = await meRes.json();
        setToken(token, userData, { refreshToken: data.refresh_token });
        sessionStorage.setItem("justLoggedIn", "1");
        router.push("/");
      } else {
        setError("Не удалось получить данные профиля после 2FA");
      }
    } catch {
      setError(t("login.serverErrorShort"));
    } finally {
      setLoading2FA(false);
    }
  }

  function cancel2FA() {
    setRequires2FA(false);
    setTempUserId(null); // Очищаем ID
    setTwoFACode("");
    setError("");
  }


  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm border border-line dark:border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
        <h1 className="font-logo text-5xl text-center mb-6 text-[#8b5cf6]">
          trelod
        </h1>

        {requires2FA ? (
          <form onSubmit={submit2FA} className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldCheck size={24} className="text-[#8b5cf6]" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("login.twoFaTitle")}</h2>
            </div>

            <p className="text-sm text-gray-600 dark:text-white/60 text-center mb-2">
              {t("login.twoFaHint")}
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
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold">
                {error}
              </div>
            )}

            <Button
              type="submit"
              loading={loading2FA}
              disabled={loading2FA || !twoFACode}
            >
              {loading2FA ? t("login.checking") : t("login.submitLogin")}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              type="button"
              icon={X}
              onClick={cancel2FA}
              className="mx-auto"
            >
              {t("login.backToLogin")}
            </Button>
          </form>
        ) : (
          <>
            <div className="flex border border-line dark:border-white/15 rounded-full overflow-hidden mb-6 bg-gray-100 dark:bg-white/5">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 py-2 font-bold transition-all ${
                  mode === "login"
                    ? "bg-[#8b5cf6] text-white"
                    : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {t("login.tabLogin")}
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 py-2 font-bold transition-all ${
                  mode === "register"
                    ? "bg-[#8b5cf6] text-white"
                    : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {t("login.tabRegister")}
              </button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode === "register" && (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("login.displayName")}
                  required
                  className={inputCls}
                />
              )}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("login.username")}
                required
                className={inputCls}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.password")}
                required
                className={inputCls}
              />
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm font-semibold">
                  {error}
                </div>
              )}
              <Button type="submit">
                {mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
              </Button>
            </form>
            
            {/* Гармоничный футер с переключателем языка */}
            <div className="mt-6 pt-4 border-t border-line dark:border-white/10 flex justify-center">
              <LanguageSwitcher variant="compact" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}