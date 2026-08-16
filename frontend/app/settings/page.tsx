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
  Smartphone,
  KeyRound,
  MessageSquareText,
  ChevronRight,
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

  // 🆕 2FA States
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupStep, setSetupStep] = useState<"scan" | "verify" | "backup">(
    "scan"
  );
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [loading2FA, setLoading2FA] = useState(false);

  // Copy username
  const [copied, setCopied] = useState(false);

  // Active sidebar section
  const [activeSection, setActiveSection] = useState("profile");

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

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );

    const sections = document.querySelectorAll("section[id]");
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [user]);

  async function fetchSecurityStatus() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/2fa/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        setSecurityStatus(await res.json());
      }
    } catch {}
  }

  async function saveProfile() {
    const token = getToken();
    if (!token) return;

    const profileRes = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/me`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: displayName, bio }),
      }
    );

    if (!profileRes.ok) {
      const err = await profileRes.json().catch(() => null);
      alert("Ошибка сохранения профиля: " + (err?.detail || "неизвестно"));
      return;
    }

    const file = fileRef.current?.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(
          `Файл слишком большой: ${(file.size / (1024 * 1024)).toFixed(
            1
          )} МБ (максимум 5 МБ)`
        );
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        alert(
          `Формат "${file.type}" не поддерживается. Используйте JPG, PNG, GIF или WebP.`
        );
        return;
      }

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/me/avatar`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          }
        );

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
      setPasswordMsg({
        text: "Пароль должен быть не менее 6 символов",
        type: "err",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: "Пароли не совпадают", type: "err" });
      return;
    }

    const token = getToken();
    if (!token) return;

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/me/password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      }
    );

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
    if (
      !confirm(
        "Выйти со всех устройств? Все активные сессии будут завершены, тебе придётся войти заново."
      )
    )
      return;
    setLoggingOutAll(true);
    const token = getToken();
    try {
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/me/logout-all`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/2fa/setup`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/2fa/activate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
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
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/2fa/disable`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
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
    "w-full border border-white/10 rounded-xl px-4 py-3 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 focus:bg-white/[0.07] transition-all pr-10";

  const sections = [
    { id: "profile", label: "Профиль", icon: User },
    { id: "notifications", label: "Уведомления", icon: Bell },
    { id: "permissions", label: "Разрешения", icon: Smartphone },
    { id: "live", label: "Сообщения", icon: MessageSquareText },
    { id: "security", label: "Безопасность", icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white scroll-smooth">
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

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-[260px] flex-col border-r border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl z-30">
        <div className="px-6 py-7 border-b border-white/5">
          <h2 className="text-xl font-black bg-gradient-to-r from-[#8b5cf6] to-[#c084fc] bg-clip-text text-transparent tracking-tight">
            Настройки
          </h2>
          <p className="text-xs text-white/40 mt-1">Управление аккаунтом</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(s.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#8b5cf6]/15 text-white shadow-[inset_0_1px_0_0_rgba(139,92,246,0.2)]"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <div
                  className={`p-1.5 rounded-md ${
                    isActive ? "bg-[#8b5cf6]/20" : "bg-white/5"
                  }`}
                >
                  <Icon
                    size={14}
                    className={isActive ? "text-[#a855f7]" : ""}
                  />
                </div>
                {s.label}
                {isActive && (
                  <div className="ml-auto w-1 h-1 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_#8b5cf6]" />
                )}
              </a>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-2 py-2">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="w-9 h-9 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                <User size={14} className="text-white/50" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {user.display_name || user.username}
              </p>
              <p className="text-xs text-white/40 truncate">
                @{user.username}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="lg:ml-[260px] p-4 sm:p-6 lg:p-10 pb-24 lg:pb-10">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Mobile only: page title */}
          <div className="lg:hidden">
            <h1 className="text-2xl font-black tracking-tight">Настройки</h1>
            <p className="text-sm text-white/40 mt-1">
              Управление аккаунтом
            </p>
          </div>

          {/* ==================== PROFILE ==================== */}
          <section
            id="profile"
            className="scroll-mt-20 lg:scroll-mt-6 space-y-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                <User size={16} className="text-[#a855f7]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Профиль</h2>
            </div>

            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md p-5 sm:p-6 space-y-6">
              {/* Avatar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="relative group">
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="w-24 h-24 rounded-2xl border-2 border-white/10 object-cover group-hover:border-[#8b5cf6]/50 transition-colors"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl border-2 border-white/10 bg-white/5 flex items-center justify-center">
                      <User size={32} className="text-white/30" />
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity backdrop-blur-sm"
                  >
                    <Camera size={22} className="text-white" />
                  </button>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm mb-2">Аватарка</p>
                  <p className="text-xs text-white/40 mb-3">
                    JPG, PNG, GIF или WebP. Максимум 5 МБ.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 border border-white/15 rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5 hover:border-white/30 hover:text-white transition-all"
                    >
                      <Upload size={14} /> Выбрать фото
                    </button>
                    {preview && (
                      <button
                        onClick={() => {
                          setPreview(null);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                        className="flex items-center gap-2 border border-white/10 rounded-lg px-3 py-2 text-sm font-medium text-white/50 hover:text-white/80 hover:border-white/20 transition-all"
                      >
                        <X size={14} /> Убрать
                      </button>
                    )}
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

              {/* Display name */}
              <div>
                <label className="block font-semibold text-sm mb-2 text-white/80">
                  Отображаемое имя
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ваше имя"
                  className={inputCls}
                />
              </div>

              {/* Bio */}
              <div>
                <label className="block font-semibold text-sm mb-2 text-white/80">
                  О себе
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  rows={3}
                  className="w-full border border-white/10 rounded-xl px-4 py-3 bg-white/5 text-white placeholder-white/30 focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 resize-none transition-all"
                  placeholder="Расскажи о себе (до 500 символов)"
                />
                <p className="text-xs text-white/30 mt-1.5 text-right">
                  <span
                    className={bio.length > 450 ? "text-amber-400" : ""}
                  >
                    {bio.length}
                  </span>
                  /500
                </p>
              </div>

              {/* Username (read-only pill) */}
              <div>
                <label className="block font-semibold text-sm mb-2 text-white/80">
                  Username
                </label>
                <div className="flex items-center gap-2 border border-white/10 rounded-xl px-4 py-3 bg-white/[0.02]">
                  <span className="text-[#a855f7] font-medium">@</span>
                  <span className="text-white/80 flex-1 font-medium tracking-wide">
                    {user.username}
                  </span>
                  <button
                    onClick={copyUsername}
                    className="p-1.5 rounded-md hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title="Скопировать"
                  >
                    {copied ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  Изменить username нельзя
                </p>
              </div>

              {/* Save / Cancel */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveProfile}
                  className="flex-1 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold rounded-xl py-3 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                >
                  Сохранить
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="flex-1 border border-white/15 rounded-xl py-3 font-bold text-white/80 hover:bg-white/5 hover:border-white/30 hover:text-white transition-all"
                >
                  Отмена
                </button>
              </div>
            </div>
          </section>

          {/* ==================== NOTIFICATIONS ==================== */}
          <section
            id="notifications"
            className="scroll-mt-20 lg:scroll-mt-6 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                <Bell size={16} className="text-[#a855f7]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                Уведомления
              </h2>
            </div>

            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md overflow-hidden">
              <div className="px-5 py-3 border-b border-white/5">
                <p className="text-xs text-white/40">
                  Push-уведомления работают даже когда приложение закрыто
                </p>
              </div>
              <div className="p-5">
                <PushSettings />
              </div>
            </div>
          </section>

          {/* ==================== PERMISSIONS ==================== */}
          <section
            id="permissions"
            className="scroll-mt-20 lg:scroll-mt-6 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                <Smartphone size={16} className="text-[#a855f7]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Разрешения</h2>
            </div>

            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md overflow-hidden">
              <DevicePermissionsSection />
            </div>
          </section>

          {/* ==================== LIVE MESSAGES ==================== */}
          <section
            id="live"
            className="scroll-mt-20 lg:scroll-mt-6 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                <MessageSquareText size={16} className="text-[#a855f7]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                Живые сообщения
              </h2>
            </div>

            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md overflow-hidden">
              <LiveTextSettings />
            </div>
          </section>

          {/* ==================== SECURITY (2FA, Email, Password, Logout) ==================== */}
          <section
            id="security"
            className="scroll-mt-20 lg:scroll-mt-6 space-y-6"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                <ShieldCheck size={16} className="text-[#a855f7]" />
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                Безопасность
              </h2>
            </div>

            {/* === 2FA === */}
            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        securityStatus?.enabled
                          ? "bg-emerald-500/15 border border-emerald-500/20"
                          : "bg-white/5 border border-white/10"
                      }`}
                    >
                      <ShieldCheck
                        size={20}
                        className={
                          securityStatus?.enabled
                            ? "text-emerald-400"
                            : "text-white/40"
                        }
                      />
                    </div>
                    <div>
                      <h3 className="font-bold">
                        Двухфакторная аутентификация
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        {securityStatus?.enabled ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 size={12} /> Включена
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <AlertCircle size={12} /> Выключена
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-white/60 mb-4 leading-relaxed">
                  {securityStatus?.enabled
                    ? "Ваш аккаунт защищён. При входе потребуется код из приложения-аутентификатора."
                    : "Добавьте дополнительный уровень защиты. При входе потребуется код из Google Authenticator или подобного приложения."}
                </p>

                {securityStatus?.enabled && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xs text-emerald-300 font-semibold">
                      🔐 Резервных кодов осталось:{" "}
                      {securityStatus.backup_codes_left}/10
                    </p>
                  </div>
                )}

                {!securityStatus?.enabled ? (
                  <button
                    onClick={start2FASetup}
                    disabled={loading2FA}
                    className="w-full flex items-center justify-center gap-2 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 font-bold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ShieldCheck size={18} />
                    {loading2FA ? "Загрузка..." : "Включить 2FA"}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDisable2FA(true)}
                    disabled={loading2FA}
                    className="w-full flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X size={18} />
                    Отключить 2FA
                  </button>
                )}
              </div>
            </div>

            {/* === EMAIL (WIP) === */}
            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md p-5 sm:p-6 opacity-80 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/20">
                    <Mail size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold">Email</h3>
                    <p className="text-xs text-amber-400/80 mt-0.5 flex items-center gap-1">
                      🚧 На доработке
                    </p>
                  </div>
                </div>

                <p className="text-sm text-white/60 mb-4 leading-relaxed">
                  Привязка email для восстановления доступа и уведомлений.
                  Функция в разработке.
                </p>

                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
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
            </div>

            {/* === CHANGE PASSWORD === */}
            <div className="border border-white/10 rounded-2xl bg-white/[0.03] backdrop-blur-md p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#8b5cf6]/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 rounded-lg bg-[#8b5cf6]/15 border border-[#8b5cf6]/20">
                    <KeyRound size={20} className="text-[#a855f7]" />
                  </div>
                  <h3 className="font-bold">Сменить пароль</h3>
                </div>

                <form onSubmit={changePassword} className="space-y-4">
                  <div>
                    <label className="block font-semibold text-xs mb-2 text-white/70 uppercase tracking-wider">
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5"
                      >
                        {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-xs mb-2 text-white/70 uppercase tracking-wider">
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
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5"
                      >
                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-xs mb-2 text-white/70 uppercase tracking-wider">
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
                      className={`p-3 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                        passwordMsg.type === "ok"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-red-500/10 border-red-500/30 text-red-400"
                      }`}
                    >
                      {passwordMsg.type === "ok" ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertCircle size={16} />
                      )}
                      {passwordMsg.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white font-bold rounded-xl py-3 transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)]"
                  >
                    Сменить пароль
                  </button>
                </form>
              </div>
            </div>

            {/* === LOGOUT ALL (destructive) === */}
            <div className="border border-red-500/20 rounded-2xl bg-red-500/[0.03] backdrop-blur-md p-5 sm:p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/20">
                    <ShieldAlert size={20} className="text-red-400" />
                  </div>
                  <h3 className="font-bold text-red-50">
                    Опасная зона
                  </h3>
                </div>

                <p className="text-sm text-white/60 mb-5 leading-relaxed">
                  Завершает все активные сессии на всех устройствах. Если кто-то
                  вошёл в твой аккаунт — он будет выброшен. Тебе придётся войти
                  заново.
                </p>

                <button
                  onClick={logoutAll}
                  disabled={loggingOutAll}
                  className="w-full flex items-center justify-center gap-2 border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-500/60 font-bold rounded-xl py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut size={18} />
                  {loggingOutAll
                    ? "Завершаем сессии..."
                    : "Выйти со всех устройств"}
                </button>
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
                <h3 className="text-xl font-black text-white">
                  Настройка 2FA
                </h3>
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
                      Откройте{" "}
                      <span className="font-bold text-white">
                        Google Authenticator
                      </span>
                      , <span className="font-bold text-white">Authy</span>{" "}
                      или подобное приложение
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      2
                    </div>
                    <p className="text-sm text-white/80">
                      Нажмите{" "}
                      <span className="font-bold text-white">«+»</span> →{" "}
                      <span className="font-bold text-white">
                        «Сканировать QR-код»
                      </span>
                    </p>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/5">
                    <div className="w-6 h-6 rounded-full bg-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold shrink-0">
                      3
                    </div>
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
                    <span className="group-open:rotate-90 transition-transform">
                      ▶
                    </span>
                    Нет камеры? Введите ключ вручную
                  </summary>
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300 mb-2 font-semibold">
                      Секретный ключ:
                    </p>
                    <p className="font-mono text-sm text-amber-200 break-all select-all">
                      {secret}
                    </p>
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
                <p className="text-sm text-white/70">
                  Введите 6-значный код из приложения-аутентификатора:
                </p>
                <input
                  value={verifyCode}
                  onChange={(e) =>
                    setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
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
                <h3 className="text-lg font-black text-white">
                  Отключить 2FA
                </h3>
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
              Введите код из приложения-аутентификатора или один из резервных
              кодов:
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