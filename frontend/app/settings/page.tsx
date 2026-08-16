"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { 
  Upload, Lock, Eye, EyeOff, LogOut, ShieldAlert, Bell,
  ShieldCheck, Mail, X, RefreshCw, Copy, CheckCircle2, AlertCircle
} from "lucide-react";
import { PushSettings } from "@/components/PushSettings";
import { DevicePermissionsSection } from "@/components/DevicePermissionsSection";
import { LiveTextSettings } from "@/components/LiveTextSettings";

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

  // 🆕 2FA States
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupStep, setSetupStep] = useState<"scan" | "verify" | "backup">("scan");
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [loading2FA, setLoading2FA] = useState(false);

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
    
    // Загружаем статус безопасности
    fetchSecurityStatus();
  }, []);

  async function fetchSecurityStatus() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/2fa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSecurityStatus(await res.json());
      }
    } catch {}
  }

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

  // 🆕 2FA Functions
  async function start2FASetup() {
    const token = getToken();
    if (!token) return;
    setLoading2FA(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/2fa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qr_code);
        setSecret(data.secret);
        setBackupCodes(data.backup_codes);
        setShow2FASetup(true);
        setSetupStep("scan");
      } else {
        const err = await res.json();
        alert(err.detail || "Ошибка");
      }
    } catch {}
    setLoading2FA(false);
  }

  async function activate2FA() {
    const token = getToken();
    if (!token) return;
    setLoading2FA(true);
    try {
      const form = new FormData();
      form.append("code", verifyCode);
      form.append("backup_codes", JSON.stringify(backupCodes));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/2fa/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        alert("✅ 2FA активирована! Сохраните резервные коды в безопасном месте.");
        setShow2FASetup(false);
        setVerifyCode("");
        fetchSecurityStatus();
      } else {
        const err = await res.json();
        alert(err.detail || "Неверный код");
      }
    } catch {}
    setLoading2FA(false);
  }

  async function disable2FA() {
    const token = getToken();
    if (!token) return;
    setLoading2FA(true);
    try {
      const form = new FormData();
      form.append("code", disableCode);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/2fa/disable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        alert("2FA отключена");
        setShowDisable2FA(false);
        setDisableCode("");
        fetchSecurityStatus();
      } else {
        const err = await res.json();
        alert(err.detail || "Неверный код");
      }
    } catch {}
    setLoading2FA(false);
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

        {/* === РАЗРЕШЕНИЯ УСТРОЙСТВА === */}
        <DevicePermissionsSection />
        <LiveTextSettings />

        {/* ========== 🆕 Блок 2FA ========== */}
        <div className="border border-emerald-500/30 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-transparent backdrop-blur-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${securityStatus?.enabled ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                <ShieldCheck size={24} className={securityStatus?.enabled ? 'text-emerald-400' : 'text-white/40'} />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Двухфакторная аутентификация</h2>
                <p className="text-sm text-white/60 mt-0.5">
                  {securityStatus?.enabled ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 size={14} /> Включена
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-white/40">
                      <AlertCircle size={14} /> Выключена
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-white/70 mb-5 leading-relaxed">
            {securityStatus?.enabled 
              ? "Ваш аккаунт защищён. При входе потребуется код из приложения-аутентификатора."
              : "Добавьте дополнительный уровень защиты. При входе потребуется код из Google Authenticator или подобного приложения."
            }
          </p>

          {securityStatus?.enabled && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-300 font-semibold">
                🔐 Резервных кодов осталось: {securityStatus.backup_codes_left}/10
              </p>
            </div>
          )}

          {!securityStatus?.enabled ? (
            <button
              onClick={start2FASetup}
              disabled={loading2FA}
              className="w-full flex items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 font-bold rounded-lg py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShieldCheck size={18} />
              {loading2FA ? "Загрузка..." : "Включить 2FA"}
            </button>
          ) : (
            <button
              onClick={() => setShowDisable2FA(true)}
              disabled={loading2FA}
              className="w-full flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-lg py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <X size={18} />
              Отключить 2FA
            </button>
          )}
        </div>

        {/* ========== 🆕 Блок Email (На доработке) ========== */}
        <div className="border border-amber-500/30 rounded-2xl bg-gradient-to-br from-amber-500/5 to-transparent backdrop-blur-md p-6 opacity-75">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Mail size={24} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Email</h2>
                <p className="text-sm text-white/60 mt-0.5 flex items-center gap-1">
                  <span className="text-amber-400">🚧 На доработке</span>
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-white/70 mb-5 leading-relaxed">
            Привязка email для восстановления доступа и уведомлений. Функция в разработке.
          </p>

          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-300 font-semibold mb-2">
              ⏳ Скоро будет доступно:
            </p>
            <ul className="text-xs text-amber-200/80 space-y-1">
              <li>• Восстановление пароля через email</li>
              <li>• Уведомления о важных событиях</li>
              <li>• Подтверждение email</li>
            </ul>
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

        {/* ========== Блок безопасности ========== */}
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

      {/* ========== 🆕 Модалка настройки 2FA ========== */}
      {show2FASetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !loading2FA && setShow2FASetup(false)} />
          <div className="relative bg-[#1f1f23] border border-white/15 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={24} className="text-emerald-400" />
                <h3 className="text-xl font-black text-white">Настройка 2FA</h3>
              </div>
              <button 
                onClick={() => !loading2FA && setShow2FASetup(false)} 
                className="text-white/50 hover:text-white transition-colors"
                disabled={loading2FA}
              >
                <X size={22} />
              </button>
            </div>

            {setupStep === "scan" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
                    <p className="text-sm text-white/80">
                      Откройте <span className="font-bold text-white">Google Authenticator</span>, <span className="font-bold text-white">Authy</span> или подобное приложение
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">2</div>
                    <p className="text-sm text-white/80">
                      Нажмите <span className="font-bold text-white">«+»</span> → <span className="font-bold text-white">«Сканировать QR-код»</span>
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">3</div>
                    <p className="text-sm text-white/80">
                      Отсканируйте QR-код ниже
                    </p>
                  </div>
                </div>

                <div className="flex justify-center bg-white rounded-xl p-5 shadow-lg">
                  <img src={qrCode} alt="QR" className="w-52 h-52" />
                </div>

                <details className="group">
                  <summary className="text-sm text-white/60 cursor-pointer hover:text-white/80 transition-colors flex items-center gap-2">
                    <span className="group-open:rotate-90 transition-transform">▶</span>
                    Нет камеры? Введите ключ вручную
                  </summary>
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300 mb-2 font-semibold">Секретный ключ:</p>
                    <p className="font-mono text-sm text-amber-200 break-all select-all">{secret}</p>
                  </div>
                </details>

                <button
                  onClick={() => setSetupStep("verify")}
                  className="w-full py-3 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] transition-colors"
                >
                  Далее →
                </button>
              </div>
            )}

            {setupStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm text-white/70">
                  Введите 6-значный код из приложения-аутентификатора:
                </p>
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-4 rounded-lg bg-white/5 border border-white/15 text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  autoFocus
                  disabled={loading2FA}
                />
                <button
                  onClick={activate2FA}
                  disabled={verifyCode.length !== 6 || loading2FA}
                  className="w-full py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading2FA ? "Проверка..." : "✓ Активировать 2FA"}
                </button>
                <button
                  onClick={() => setSetupStep("scan")}
                  disabled={loading2FA}
                  className="w-full py-2.5 text-white/60 hover:text-white text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  ← Назад
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== 🆕 Модалка отключения 2FA ========== */}
      {showDisable2FA && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !loading2FA && setShowDisable2FA(false)} />
          <div className="relative bg-[#1f1f23] border border-white/15 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <X size={22} className="text-red-400" />
                <h3 className="text-lg font-black text-white">Отключить 2FA</h3>
              </div>
              <button 
                onClick={() => !loading2FA && setShowDisable2FA(false)} 
                className="text-white/50 hover:text-white transition-colors"
                disabled={loading2FA}
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-white/70 mb-4">
              Введите код из приложения-аутентификатора или один из резервных кодов:
            </p>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="Код или резервный код"
              className="w-full px-4 py-4 rounded-lg bg-white/5 border border-white/15 text-white text-center text-xl tracking-wider font-mono focus:outline-none focus:border-red-500 mb-4 transition-colors"
              autoFocus
              disabled={loading2FA}
            />
            <div className="flex gap-2">
              <button
                onClick={disable2FA}
                disabled={!disableCode || loading2FA}
                className="flex-1 py-3 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading2FA ? "Проверка..." : "Отключить"}
              </button>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                disabled={loading2FA}
                className="flex-1 py-3 rounded-lg bg-white/10 text-white font-bold hover:bg-white/15 disabled:opacity-40 transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}