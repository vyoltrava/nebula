"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import {
  ArrowLeft,
  User,
  Bell,
  Mic,
  Zap,
  ShieldCheck,
  LogOut,
  Camera,
  Copy,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  X,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { PushSettings } from "@/components/PushSettings";
import { DevicePermissionsSection } from "@/components/DevicePermissionsSection";
import { LiveTextSettings } from "@/components/LiveTextSettings";

type View = "profile" | "notifications" | "permissions" | "messages" | "security";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [view, setView] = useState<View>("profile");

  // Пароли
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
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
        if (data.avatar_url) setPreview(mediaUrl(data.avatar_url));
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
      if (res.ok) setSecurityStatus(await res.json());
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
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });

    if (res.ok) {
      setPasswordMsg({ text: "Пароль успешно изменён!", type: "ok" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => null);
      setPasswordMsg({ text: data?.detail ?? "Ошибка смены пароля", type: "err" });
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
    if (f) setPreview(URL.createObjectURL(f));
  }

  function copyUsername() {
    navigator.clipboard.writeText(user?.username || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!user)
    return (
      <div className="min-h-screen bg-[#1C1C1F] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#B9B8BD]">
          <RefreshCw size={16} className="animate-spin text-[#7B3FF2]" />
          <span className="text-sm">Загрузка...</span>
        </div>
      </div>
    );

  const nav: { id: View; label: string; icon: any }[] = [
    { id: "profile", label: "Профиль", icon: User },
    { id: "notifications", label: "Уведомления", icon: Bell },
    { id: "permissions", label: "Разрешения", icon: Mic },
    { id: "messages", label: "Живые сообщения", icon: Zap },
    { id: "security", label: "Безопасность", icon: ShieldCheck },
  ];

  const labelCls = "block text-xs font-medium text-[#B9B8BD] mb-1.5";

  const inputCls =
    "w-full bg-[#1C1C1F] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#7B3FF2] transition-colors";

  const btnPrimary =
    "bg-[#7B3FF2] hover:bg-[#6a34d3] active:bg-[#5b2cb8] text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const btnSecondary =
    "border border-[#7B3FF2]/60 text-[#a678f7] hover:bg-[#7B3FF2]/10 text-sm font-medium rounded-lg px-5 py-2.5 transition-colors";

  const btnDanger =
    "border border-[#E74C3C]/50 bg-[#E74C3C]/10 text-[#E74C3C] hover:bg-[#E74C3C]/20 text-sm font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="min-h-screen bg-[#1C1C1F] text-white"
      style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        {/* ===== Шапка ===== */}
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="w-10 h-10 rounded-lg border border-white/10 bg-[#1E1E23] text-[#B9B8BD] hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-2xl font-bold">Настройки</h1>
        </header>

        {/* ===== Мобильные чипы ===== */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                view === n.id
                  ? "bg-[#7B3FF2] text-white"
                  : "bg-[#1E1E23] border border-white/10 text-[#B9B8BD] hover:text-white"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 items-start">
          {/* ===== Сайдбар (ПК) ===== */}
          <aside className="hidden lg:flex flex-col gap-1 bg-[#1E1E23] border border-white/10 rounded-xl p-3 sticky top-6">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = view === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? "bg-[#7B3FF2] text-white" : "text-[#B9B8BD] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={16} />
                  {n.label}
                </button>
              );
            })}
            <div className="my-2 h-px bg-white/10" />
            <button
              onClick={logoutAll}
              disabled={loggingOutAll}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors disabled:opacity-40"
            >
              <LogOut size={16} />
              {loggingOutAll ? "Завершаем..." : "Выход"}
            </button>
          </aside>

          {/* ===== Контент ===== */}
          <section className="bg-[#1E1E23] border border-white/10 rounded-xl p-5 sm:p-6">
            {/* ---------- ПРОФИЛЬ ---------- */}
            {view === "profile" && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">Профиль</h2>

                {/* Аватар */}
                <div className="flex items-center gap-4">
                  {preview ? (
                    <img src={preview} alt="" className="w-20 h-20 rounded-xl object-cover border border-white/10" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <User size={28} className="text-[#B9B8BD]" />
                    </div>
                  )}
                  <div>
                    <button onClick={() => fileRef.current?.click()} className={btnSecondary + " flex items-center gap-2"}>
                      <Camera size={15} /> Выбрать фото
                    </button>
                    <p className="text-xs text-[#B9B8BD] mt-2">JPG, PNG, GIF или WebP, максимум 5 МБ</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                {/* Имя */}
                <div>
                  <label className={labelCls}>Отображаемое имя</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
                </div>

                {/* О себе */}
                <div>
                  <label className={labelCls}>О себе</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="Расскажи о себе"
                    className={inputCls + " resize-none"}
                  />
                  <p className="text-xs text-[#B9B8BD] mt-1 text-right">
                    <span className={bio.length > 450 ? "text-[#E74C3C]" : ""}>{bio.length}</span>/500
                  </p>
                </div>

                {/* Username */}
                <div>
                  <label className={labelCls}>Username</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-[#1C1C1F] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-[#B9B8BD]">
                      @{user.username}
                    </div>
                    <button
                      onClick={copyUsername}
                      className="w-10 h-10 shrink-0 rounded-lg border border-white/10 text-[#B9B8BD] hover:text-white hover:bg-white/5 flex items-center justify-center transition-colors"
                      title="Скопировать"
                    >
                      {copied ? <CheckCircle2 size={16} className="text-[#2ECC71]" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={saveProfile} className={btnPrimary}>
                    Сохранить
                  </button>
                  <button onClick={() => router.push("/")} className={btnSecondary}>
                    Отмена
                  </button>
                </div>
              </div>
            )}

            {/* ---------- УВЕДОМЛЕНИЯ ---------- */}
            {view === "notifications" && (
              <div>
                <h2 className="text-lg font-semibold mb-1">Уведомления</h2>
                <p className="text-sm text-[#B9B8BD] mb-4">Push-уведомления работают даже когда приложение закрыто</p>
                <PushSettings />
              </div>
            )}

            {/* ---------- РАЗРЕШЕНИЯ ---------- */}
            {view === "permissions" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Разрешения</h2>
                <DevicePermissionsSection />
              </div>
            )}

            {/* ---------- ЖИВЫЕ СООБЩЕНИЯ ---------- */}
            {view === "messages" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">Живые сообщения</h2>
                <LiveTextSettings />
              </div>
            )}

            {/* ---------- БЕЗОПАСНОСТЬ ---------- */}
            {view === "security" && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">Безопасность</h2>

                {/* 2FA */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          securityStatus?.enabled ? "bg-[#2ECC71]/15 text-[#2ECC71]" : "bg-white/5 text-[#B9B8BD]"
                        }`}
                      >
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Двухфакторная аутентификация</p>
                        <p className={`text-xs mt-0.5 ${securityStatus?.enabled ? "text-[#2ECC71]" : "text-[#B9B8BD]"}`}>
                          {securityStatus?.enabled ? "Включена" : "Выключена"}
                          {securityStatus?.enabled && ` · кодов осталось: ${securityStatus.backup_codes_left}/10`}
                        </p>
                      </div>
                    </div>
                    {!securityStatus?.enabled ? (
                      <button onClick={start2FASetup} disabled={loading2FA} className={btnPrimary}>
                        {loading2FA ? "Загрузка..." : "Включить"}
                      </button>
                    ) : (
                      <button onClick={() => setShowDisable2FA(true)} disabled={loading2FA} className={btnDanger}>
                        Отключить
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-[#B9B8BD] mt-3 leading-relaxed">
                    {securityStatus?.enabled
                      ? "Аккаунт защищён. При входе потребуется код из приложения-аутентификатора."
                      : "Дополнительный уровень защиты: при входе потребуется код из Google Authenticator или подобного приложения."}
                  </p>
                </div>

                {/* Email */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                        <Mail size={18} className="text-[#B9B8BD]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-xs mt-0.5 text-[#B9B8BD]">🚧 На доработке</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-[#B9B8BD] mt-3 leading-relaxed">
                    Привязка email для восстановления доступа и уведомлений. Функция в разработке.
                  </p>
                </div>

                {/* Пароль */}
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                      <Lock size={18} className="text-[#a678f7]" />
                    </div>
                    <p className="text-sm font-medium">Сменить пароль</p>
                  </div>

                  <form onSubmit={changePassword} className="space-y-4">
                    <div>
                      <label className={labelCls}>Текущий пароль</label>
                      <div className="relative">
                        <input
                          type={showOld ? "text" : "password"}
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          placeholder="Введите старый пароль"
                          required
                          className={inputCls + " pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowOld(!showOld)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-white transition-colors"
                        >
                          {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Новый пароль</label>
                      <div className="relative">
                        <input
                          type={showNew ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Минимум 6 символов"
                          required
                          minLength={6}
                          className={inputCls + " pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew(!showNew)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-white transition-colors"
                        >
                          {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Повторите новый пароль</label>
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
                        className={`p-3 rounded-lg border text-sm font-medium flex items-center gap-2 ${
                          passwordMsg.type === "ok"
                            ? "bg-[#2ECC71]/10 border-[#2ECC71]/30 text-[#2ECC71]"
                            : "bg-[#E74C3C]/10 border-[#E74C3C]/30 text-[#E74C3C]"
                        }`}
                      >
                        {passwordMsg.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {passwordMsg.text}
                      </div>
                    )}

                    <button type="submit" className={btnPrimary + " w-full"}>
                      Сменить пароль
                    </button>
                  </form>
                </div>

                {/* Выход со всех устройств */}
                <div className="p-4 rounded-lg border border-[#E74C3C]/30 bg-[#E74C3C]/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[#E74C3C]/15 flex items-center justify-center">
                      <ShieldAlert size={18} className="text-[#E74C3C]" />
                    </div>
                    <p className="text-sm font-medium">Выйти со всех устройств</p>
                  </div>
                  <p className="text-sm text-[#B9B8BD] mb-4 leading-relaxed">
                    Завершает все активные сессии. Если кто-то вошёл в твой аккаунт — он будет выброшен, тебе придётся войти заново.
                  </p>
                  <button onClick={logoutAll} disabled={loggingOutAll} className={btnDanger + " w-full flex items-center justify-center gap-2"}>
                    <LogOut size={16} />
                    {loggingOutAll ? "Завершаем сессии..." : "Выйти со всех устройств"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* ===== MODAL: 2FA Setup ===== */}
      {show2FASetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !loading2FA && setShow2FASetup(false)} />
          <div className="relative bg-[#1E1E23] border border-white/10 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Настройка 2FA</h3>
              <button
                onClick={() => !loading2FA && setShow2FASetup(false)}
                className="text-[#B9B8BD] hover:text-white transition-colors p-1"
                disabled={loading2FA}
              >
                <X size={20} />
              </button>
            </div>

            {setupStep === "scan" && (
              <div className="space-y-4">
                <div className="space-y-2 text-sm text-[#B9B8BD]">
                  <p><span className="text-[#a678f7] font-semibold mr-2">1</span>Откройте Google Authenticator / Authy</p>
                  <p><span className="text-[#a678f7] font-semibold mr-2">2</span>Нажмите «+» → «Сканировать QR-код»</p>
                  <p><span className="text-[#a678f7] font-semibold mr-2">3</span>Отсканируйте код ниже</p>
                </div>

                <div className="flex justify-center bg-white rounded-lg p-5">
                  <img src={qrCode} alt="QR" className="w-52 h-52" />
                </div>

                <details className="group">
                  <summary className="text-sm text-[#B9B8BD] cursor-pointer hover:text-white transition-colors">
                    Нет камеры? Введите ключ вручную
                  </summary>
                  <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <p className="text-xs text-[#B9B8BD] mb-1">Секретный ключ:</p>
                    <p className="font-mono text-sm text-white break-all select-all">{secret}</p>
                  </div>
                </details>

                <button onClick={() => setSetupStep("verify")} className={btnPrimary + " w-full"}>
                  Далее
                </button>
              </div>
            )}

            {setupStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm text-[#B9B8BD]">Введите 6-значный код из приложения-аутентификатора:</p>
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className={inputCls + " text-center text-2xl tracking-[0.5em] font-mono py-3"}
                  autoFocus
                  disabled={loading2FA}
                />
                <button
                  onClick={activate2FA}
                  disabled={verifyCode.length !== 6 || loading2FA}
                  className={btnPrimary + " w-full"}
                >
                  {loading2FA ? "Проверка..." : "Активировать 2FA"}
                </button>
                <button
                  onClick={() => setSetupStep("scan")}
                  disabled={loading2FA}
                  className="w-full text-sm text-[#B9B8BD] hover:text-white transition-colors disabled:opacity-40"
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
          <div className="absolute inset-0 bg-black/70" onClick={() => !loading2FA && setShowDisable2FA(false)} />
          <div className="relative bg-[#1E1E23] border border-white/10 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Отключить 2FA</h3>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                className="text-[#B9B8BD] hover:text-white transition-colors p-1"
                disabled={loading2FA}
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-[#B9B8BD] mb-4">Введите код из приложения или резервный код:</p>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="Код"
              className={inputCls + " text-center text-xl tracking-widest font-mono py-3 mb-4"}
              autoFocus
              disabled={loading2FA}
            />
            <div className="flex gap-3">
              <button onClick={disable2FA} disabled={!disableCode || loading2FA} className={btnDanger + " flex-1"}>
                {loading2FA ? "Проверка..." : "Отключить"}
              </button>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                disabled={loading2FA}
                className={btnSecondary + " flex-1"}
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