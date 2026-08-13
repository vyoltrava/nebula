"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Upload, Lock, Eye, EyeOff, LogOut, ShieldAlert, Bell } from "lucide-react";
import { PushSettings } from "@/components/PushSettings";


export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Пароли
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [bio, setBio] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setUser(data);
        setDisplayName(data.display_name);
        setBio(data.bio || "");
        if (data.avatar_url) {
          setPreview(mediaUrl(data.avatar_url));
        }
      });
  }, []);

  async function saveProfile() {
    const token = getToken();
    if (!token) return;

    const profileRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: displayName, bio }),
    });

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => null);
      alert("Ошибка сохранения профиля: " + (err?.detail || "неизвестно"));
      return;
    }

    const file = fileRef.current?.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(`Файл слишком большой: ${(file.size / (1024 * 1024)).toFixed(1)} МБ (максимум 5 МБ)`);
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        alert(`Формат "${file.type}" не поддерживается. Используйте JPG, PNG, GIF или WebP.`);
        return;
      }

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          alert("Ошибка загрузки аватарки: " + (err?.detail || "неизвестно"));
          return;
        }
      } catch (e) {
        alert("Ошибка сети при загрузке аватарки");
        return;
      }
    }

    router.push("/");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ text: "Пароль должен быть не менее 6 символов", type: "err" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Пароли не совпадают", type: "err" });
      return;
    }

    const token = getToken();
    if (!token) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });

    if (res.ok) {
      setPasswordMsg({ text: "Пароль успешно изменён!", type: "ok" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => null);
      setPasswordMsg({
        text: data?.detail ?? "Ошибка смены пароля",
        type: "err",
      });
    }
  }

  async function logoutAll() {
    if (!confirm("Выйти со всех устройств? Все активные сессии будут завершены, тебе придётся войти заново.")) return;
    setLoggingOutAll(true);
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

  function onFile(f: File | null) {
    if (f) {
      setPreview(URL.createObjectURL(f));
    }
  }

  if (!user) return <div className="p-8 text-white/60">Загрузка...</div>;

  const inputCls =
    "w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] focus:bg-white/10 transition-all pr-10";

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* ========== Блок профиля ========== */}
        <div className="border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
          <h1 className="text-2xl font-black mb-6 text-white">Настройки профиля</h1>
          <div className="space-y-6">
            <div>
              <label className="block font-bold mb-2 text-white/80">Аватарка</label>
              <div className="flex items-center gap-4">
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="w-20 h-20 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full border border-white/20 bg-white/5" />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 border border-white/20 rounded-lg px-4 py-2 font-semibold text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
                >
                  <Upload size={16} /> Выбрать фото
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold mb-2 text-white/80">Отображаемое имя</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-white/80">О себе</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 500))}
                rows={3}
                className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] resize-none"
                placeholder="Расскажи о себе (до 500 символов)"
              />
              <p className="text-xs text-white/40 mt-1 text-right">{bio.length}/500</p>
            </div>

            <div>
              <label className="block font-bold mb-2 text-white/80">Username</label>
              <input
                value={`@${user.username}`}
                disabled
                className="w-full border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white/50"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={saveProfile}
                className="flex-1 border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2 transition-all"
              >
                Сохранить
              </button>
              <button
                onClick={() => router.push("/")}
                className="flex-1 border border-white/20 rounded-lg py-2 font-bold text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>

          {/* === УВЕДОМЛЕНИЯ === */}
          <div className="bg-[#1f1f23] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-white/10">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Bell size={16} className="text-[#8b5cf6]" />
                Уведомления
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                Push-уведомления работают даже когда приложение закрыто
              </p>
            </div>
            <div className="p-4 sm:p-5 space-y-3">
              <PushSettings />
            </div>
          </div>




        {/* ========== Блок смены пароля ========== */}
        <div className="border border-white/15 rounded-2xl bg-white/5 backdrop-blur-md p-6">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={20} className="text-[#8b5cf6]" />
            <h2 className="text-xl font-black text-white">Сменить пароль</h2>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <div>
              <label className="block font-bold mb-2 text-white/80 text-sm">
                Текущий пароль
              </label>
              <div className="relative">
                <input
                  type={showOld ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Введите старый пароль"
                  required
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                >
                  {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold mb-2 text-white/80 text-sm">
                Новый пароль
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-bold mb-2 text-white/80 text-sm">
                Повторите новый пароль
              </label>
              <input
                type={showNew ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите пароль"
                required
                minLength={6}
                className={inputCls}
              />
            </div>

            {passwordMsg && (
              <div
                className={`p-3 rounded-lg border text-sm font-semibold ${
                  passwordMsg.type === "ok"
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {passwordMsg.text}
              </div>
            )}

            <button
              type="submit"
              className="w-full border border-[#8b5cf6] bg-[#8b5cf6] text-white font-bold rounded-lg py-2.5 transition-all"
            >
              Сменить пароль
            </button>
          </form>
        </div>

        {/* ========== 🆕 Блок безопасности ========== */}
        <div className="border border-red-500/30 rounded-2xl bg-red-500/5 backdrop-blur-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={20} className="text-red-400" />
            <h2 className="text-xl font-black text-white">Безопасность</h2>
          </div>

          <p className="text-sm text-white/60 mb-5">
            Завершает все активные сессии на всех устройствах. Если кто-то вошёл в твой аккаунт — он будет выброшен. Тебе придётся войти заново.
          </p>

          <button
            onClick={logoutAll}
            disabled={loggingOutAll}
            className="w-full flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-lg py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <LogOut size={18} />
            {loggingOutAll ? "Завершаем сессии..." : "Выйти со всех устройств"}
          </button>
        </div>
      </div>
    </div>
  );
}