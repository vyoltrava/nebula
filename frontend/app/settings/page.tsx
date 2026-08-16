"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import {
  Upload,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  ShieldAlert,
  Bell,
  ShieldCheck,
  Mail,
  X,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Camera,
  User,
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
  const [passwordMsg, setPasswordMsg] = useState<{
    text: string;
    type: "ok" | "err";
  } | null>(null);
  const [bio, setBio] = useState("");
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  // 2FA States
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

  const [copied, setCopied] = useState(false);

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

  // 2FA Functions
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

  function copyUsername() {
    navigator.clipboard.writeText(user?.username || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!user)
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/60">
          <RefreshCw size={18} className="animate-spin text-[#8b5cf6]" />
          <span>Загрузка...</span>
        </div>
      </div>
    );

  const inputCls =
    "w-full border border-white/10 rounded-xl px-4 py-2.5 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 focus:bg-white/[0.07] transition-all";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* ===== MOBILE HEADER ===== */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
        <button
          onClick={() => router.push("/")}
          className="p-2 -ml-2 rounded-lg hover:bg-white/10 text-white/80 transition-colors"
          aria-label="Назад"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold tracking-tight">Настройки</h1>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        {/* ===== DESKTOP HEADER ===== */}
        <div className="hidden lg:flex items-end justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Настройки</h1>
            <p className="text-sm text-white/40 mt-1">Профиль, разрешения и безопасность</p>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
              securityStatus?.enabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-white/10 bg-white/5 text-white/40"
            }`}
          >
            <ShieldCheck size={14} />
            {securityStatus?.enabled ? "2FA включена" : "2FA выключена"}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          {/* ==================== ПРОФИЛЬ ==================== */}
          <section className="md:col-span-2 xl:col-span-1">
            <div className="border border-[#8b5cf6]/25 rounded-2xl bg-white/[0.03] backdrop-blur-md p-6 shadow-[0_0_40px_rgba(139,92,246,0.08)]">
              {/* Аватар */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-br from-[#8b5cf6] to-[#8b5cf6]/10 shadow-[0_0_25px_rgba(139,92,246,0.35)]">
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        className="w-full h-full rounded-full object-cover border-2 border-[#0a0a0f]"
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-[#1a1a22] border-2 border-[#0a0a0f] flex items-center justify-center">
                        <User size={28} className="text-white/30" />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] flex items-center justify-center shadow-lg transition-colors"
                    title="Сменить аватар"
                  >
                    <Camera size={16} />
                  </button>
                </div>
                <p className="text-[11px] text-white/35 mt-3">JPG, PNG, GIF, WebP · до 5 МБ</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block font-semibold text-xs mb-1.5 text-white/70 uppercase tracking-wider">
                    Отображаемое имя
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ваше имя"
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-xs mb-1.5 text-white/70 uppercase tracking-wider">
                    О себе
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 500))}
                    rows={3}
                    className="w-full border border-white/10 rounded-xl px-4 py-2.5 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 resize-none transition-all"
                    placeholder="Расскажи о себе (до 500 символов)"
                  />
                  <p className="text-[11px] text-white/30 mt-1 text-right">
                    <span className={bio.length > 450 ? "text-amber-400" : ""}>{bio.length}</span>/500
                  </p>
                </div>

                {/* Username */}
                <div className="flex items-center justify-center gap-2 border border-[#8b5cf6]/40 rounded-full px-4 py-2 bg-[#8b5cf6]/10">
                  <span className="text-[#c084fc] font-semibold text-sm">@{user.username}</span>
                  <button
                    onClick={copyUsername}
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    title="Скопировать"
                  >
                    {copied ? (
                      <CheckCircle2 size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} className="text-[#c084fc]" />
                    )}
                  </button>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={saveProfile}
                    className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold rounded-xl py-2.5 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => router.push("/")}
                    className="flex-1 border border-white/15 rounded-xl py-2.5 font-bold text-white/70 hover:bg-white/5 hover:border-white/30 hover:text-white transition-all"
                  >
                    Отмена
                  </button>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </section>

          {/* ==================== УВЕДОМЛЕНИЯ + РАЗРЕШЕНИЯ ==================== */}
          <section className="space-y-5">
            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#8b5cf6]/15">
                  <Bell size={16} className="text-[#a855f7]" />
                </div>
                <div>
                  <h2 className="font-bold text-sm">Уведомления</h2>
                  <p className="text-xs text-white/40 mt-0.5">Push работают даже при закрытом приложении</p>
                </div>
              </div>
              <div className="p-5">
                <PushSettings />
              </div>
            </div>

            <DevicePermissionsSection />
          </section>

          {/* ==================== ЖИВЫЕ СООБЩЕНИЯ ==================== */}
          <section className="md:col-span-2 xl:col-span-1">
            <LiveTextSettings />
          </section>

          {/* ==================== БЕЗОПАСНОСТЬ (одна карточка) ==================== */}
          <section className="md:col-span-2 xl:col-span-3">
            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md overflow-hidden">
              {/* Шапка */}
              <div className="px-5 sm:px-6 py-4 border-b border-white/5 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#8b5cf6]/15">
                  <ShieldCheck size={16} className="text-[#a855f7]" />
                </div>
                <h2 className="font-bold">Безопасность</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 divide-y divide-white/5 lg:divide-y-0 lg:divide-x">
                {/* --- 2FA --- */}
                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <ShieldCheck size={15} className={securityStatus?.enabled ? "text-emerald-400" : "text-white/40"} />
                      Двухфакторная аутентификация
                    </h3>
                  </div>
                  <p className="text-xs mb-3">
                    {securityStatus?.enabled ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 size={12} /> Включена
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-white/40">
                        <AlertCircle size={12} /> Выключена
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-white/50 mb-4 leading-relaxed">
                    {securityStatus?.enabled
                      ? "Аккаунт защищён. При входе потребуется код из приложения-аутентификатора."
                      : "Дополнительный уровень защиты: при входе потребуется код из Google Authenticator."}
                  </p>

                  {securityStatus?.enabled && (
                    <div className="mb-4 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <p className="text-[11px] text-emerald-300 font-semibold">
                        🔐 Резервных кодов: {securityStatus.backup_codes_left}/10
                      </p>
                    </div>
                  )}

                  {!securityStatus?.enabled ? (
                    <button
                      onClick={start2FASetup}
                      disabled={loading2FA}
                      className="w-full flex items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 font-bold rounded-xl py-2.5 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ShieldCheck size={16} />
                      {loading2FA ? "Загрузка..." : "Включить 2FA"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowDisable2FA(true)}
                      disabled={loading2FA}
                      className="w-full flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-xl py-2.5 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X size={16} />
                      Отключить 2FA
                    </button>
                  )}
                </div>

                {/* --- Email --- */}
                <div className="p-5 sm:p-6">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                    <Mail size={15} className="text-amber-400" />
                    Email
                  </h3>
                  <p className="text-xs text-amber-400/80 mb-3">🚧 На доработке</p>
                  <p className="text-xs text-white/50 mb-4 leading-relaxed">
                    Привязка email для восстановления доступа и уведомлений. Функция в разработке.
                  </p>
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-[11px] text-amber-300 font-semibold mb-1.5">⏳ Скоро:</p>
                    <ul className="text-[11px] text-amber-200/80 space-y-1">
                      <li>• Восстановление пароля</li>
                      <li>• Уведомления о событиях</li>
                      <li>• Подтверждение email</li>
                    </ul>
                  </div>
                </div>

                {/* --- Смена пароля --- */}
                <div className="p-5 sm:p-6">
                  <h3 className="font-bold text-sm flex items-center gap-2 mb-4">
                    <Lock size={15} className="text-[#a855f7]" />
                    Сменить пароль
                  </h3>

                  <form onSubmit={changePassword} className="space-y-3">
                    <div className="relative">
                      <input
                        type={showOld ? "text" : "password"}
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="Текущий пароль"
                        required
                        className={inputCls + " pr-10"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOld(!showOld)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5"
                      >
                        {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Новый пароль (мин. 6)"
                        required
                        minLength={6}
                        className={inputCls + " pr-10"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(!showNew)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5"
                      >
                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>

                    <input
                      type={showNew ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Повторите новый пароль"
                      required
                      minLength={6}
                      className={inputCls}
                    />

                    {passwordMsg && (
                      <div
                        className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                          passwordMsg.type === "ok"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-red-500/10 border-red-500/30 text-red-400"
                        }`}
                      >
                        {passwordMsg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                        {passwordMsg.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold rounded-xl py-2.5 text-sm transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                    >
                      Сменить пароль
                    </button>
                  </form>
                </div>
              </div>

              {/* --- Выход со всех устройств --- */}
              <div className="px-5 sm:px-6 py-4 border-t border-red-500/15 bg-red-500/[0.04]">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <ShieldAlert size={16} className="text-red-400 shrink-0" />
                    <p className="text-xs text-white/50">
                      Завершит все активные сессии на всех устройствах — придётся войти заново.
                    </p>
                  </div>
                  <button
                    onClick={logoutAll}
                    disabled={loggingOutAll}
                    className="flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-xl px-5 py-2.5 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <LogOut size={16} />
                    {loggingOutAll ? "Завершаем сессии..." : "Выйти со всех устройств"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* ===== MODAL: 2FA Setup ===== */}
      {show2FASetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !loading2FA && setShow2FASetup(false)}
          />
          <div className="relative bg-[#12121a] border border-white/15 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShieldCheck size={24} className="text-emerald-400" />
                <h3 className="text-xl font-black text-white">Настройка 2FA</h3>
              </div>
              <button
                onClick={() => !loading2FA && setShow2FASetup(false)}
                className="text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
                disabled={loading2FA}
              >
                <X size={20} />
              </button>
            </div>

            {setupStep === "scan" && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      1
                    </div>
                    <p className="text-sm text-white/80">
                      Откройте <span className="font-bold text-white">Google Authenticator</span>,{" "}
                      <span className="font-bold text-white">Authy</span> или подобное приложение
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      2
                    </div>
                    <p className="text-sm text-white/80">
                      Нажмите <span className="font-bold text-white">«+»</span> →{" "}
                      <span className="font-bold text-white">«Сканировать QR-код»</span>
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      3
                    </div>
                    <p className="text-sm text-white/80">Отсканируйте QR-код ниже</p>
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
                  className="w-full py-3 rounded-xl bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold transition-colors shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  Далее →
                </button>
              </div>
            )}

            {setupStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm text-white/70">Введите 6-значный код из приложения-аутентификатора:</p>
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/15 text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  autoFocus
                  disabled={loading2FA}
                />
                <button
                  onClick={activate2FA}
                  disabled={verifyCode.length !== 6 || loading2FA}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

      {/* ===== MODAL: Disable 2FA ===== */}
      {showDisable2FA && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !loading2FA && setShowDisable2FA(false)}
          />
          <div className="relative bg-[#12121a] border border-white/15 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <X size={22} className="text-red-400" />
                <h3 className="text-lg font-black text-white">Отключить 2FA</h3>
              </div>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                className="text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
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
              className="w-full px-4 py-4 rounded-xl bg-white/5 border border-white/15 text-white text-center text-xl tracking-wider font-mono focus:outline-none focus:border-red-500 mb-4 transition-colors"
              autoFocus
              disabled={loading2FA}
            />
            <div className="flex gap-2">
              <button
                onClick={disable2FA}
                disabled={!disableCode || loading2FA}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading2FA ? "Проверка..." : "Отключить"}
              </button>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                disabled={loading2FA}
                className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold disabled:opacity-40 transition-colors"
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