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
  Palette,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { PushSettings } from "@/components/PushSettings";
import { DevicePermissionsSection } from "@/components/DevicePermissionsSection";
import { LiveTextSettings } from "@/components/LiveTextSettings";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PaymentShop } from "@/components/payments/PaymentShop";
import { Button, IconButton } from "@/components/ui/Button";

type View = "profile" | "payments" | "appearance" | "notifications" | "permissions" | "messages" | "security" | "nebula";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useI18n();

  const { isNebula, toggleNebula } = useNebulaMode();

  const [view, setView] = useState<View>("profile");

  // Поддержка ?view=... (например, из Nebula-настроек: /settings?view=security)
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    const valid: View[] = ["profile", "payments", "appearance", "notifications", "permissions", "messages", "security", "nebula"];
    if (v && valid.includes(v as View)) setView(v as View);
  }, []);

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
      alert(t("settings.saveProfileError", { detail: err?.detail || t("common.unknownError") }));
      return;
    }

    const file = fileRef.current?.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert(t("settings.fileTooBig", { size: (file.size / (1024 * 1024)).toFixed(1) }));
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        alert(t("settings.formatUnsupported", { type: file.type }));
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
          alert(t("settings.avatarUploadError", { detail: err?.detail || t("common.unknownError") }));
          return;
        }
      } catch (e) {
        alert(t("settings.avatarNetworkError"));
        return;
      }
    }

    router.push("/");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword.length < 6) {
      setPasswordMsg({ text: t("settings.passwordMin"), type: "err" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: t("settings.passwordMismatch"), type: "err" });
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
      setPasswordMsg({ text: t("settings.passwordChanged"), type: "ok" });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => null);
      setPasswordMsg({ text: data?.detail ?? t("settings.passwordChangeError"), type: "err" });
    }
  }

  async function logoutAll() {
    if (!confirm(t("settings.logoutAllConfirm"))) return;
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
        alert(err.detail || t("common.error"));
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
      // ✅ НЕ закрываем модалку — переходим к показу кодов
      setSetupStep("backup");
      setVerifyCode("");
      fetchSecurityStatus();
    } else {
      const err = await res.json();
      alert(err.detail || t("settings.invalidCode"));
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
        alert(t("settings.twoFaDisabled"));
        setShowDisable2FA(false);
        setDisableCode("");
        fetchSecurityStatus();
      } else {
        const err = await res.json();
        alert(err.detail || t("settings.invalidCode"));
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
      <div className="min-h-screen bg-gray-100 dark:bg-[#1C1C1F] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#B9B8BD]">
          <RefreshCw size={16} className="animate-spin text-[#7B3FF2]" />
          <span className="text-sm">{t("common.loading")}</span>
        </div>
      </div>
    );

  const nav: { id: View; label: string; icon: any }[] = [
    { id: "profile", label: t("settings.profile"), icon: User },
    { id: "payments", label: t("settings.payments"), icon: CreditCard },
    { id: "appearance", label: t("settings.appearance"), icon: Palette },
    { id: "notifications", label: t("settings.notifications"), icon: Bell },
    { id: "permissions", label: t("settings.permissions"), icon: Mic },
    { id: "messages", label: t("settings.liveMessages"), icon: Zap },
    { id: "security", label: t("settings.security"), icon: ShieldCheck },
    { id: "nebula", label: "Nebula", icon: Sparkles },
  ];

  const labelCls = "block text-xs font-medium text-gray-500 dark:text-[#B9B8BD] mb-1.5";

  const inputCls =
    "w-full bg-gray-100 dark:bg-[#1C1C1F] border border-line dark:border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/25 focus:outline-none focus:border-[#7B3FF2] transition-colors";

  const btnPrimary =
    "bg-[#7B3FF2] hover:bg-[#6a34d3] active:bg-[#5b2cb8] text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  const btnSecondary =
    "border border-[#7B3FF2]/60 text-violet-600 dark:text-[#a678f7] hover:bg-[#7B3FF2]/10 text-sm font-medium rounded-lg px-5 py-2.5 transition-colors";

  const btnDanger =
    "border border-[#E74C3C]/50 bg-[#E74C3C]/10 text-[#E74C3C] hover:bg-[#E74C3C]/20 text-sm font-medium rounded-lg px-5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      className="min-h-screen bg-gray-100 dark:bg-[#1C1C1F] text-gray-900 dark:text-white"
      style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif" }}
    >
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-4 lg:py-6">
        {/* ===== Шапка ===== */}
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push(isNebula ? "/messages" : "/")}
            className="w-10 h-10 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-[#1E1E23] text-[#B9B8BD] hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center transition-colors"
            aria-label={t("common.back")}
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        </header>

        {/* ===== Мобильные чипы ===== */}
<div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
  {nav.map((n) => (
    <button
      key={n.id}
      onClick={() => setView(n.id)}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        view === n.id
          ? "bg-[#8b5cf6]/15 text-[#a78bfa] border border-[#8b5cf6]/30"
          : "bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 hover:bg-white/[0.03]"
      }`}
    >
      {n.label}
    </button>
  ))}
</div>

        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6 items-start">
          {/* ===== Сайдбар (ПК) ===== */}

<aside className="hidden lg:flex flex-col gap-1 bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-3 sticky top-6">
  {nav.map((n) => {
    const Icon = n.icon;
    const active = view === n.id;
    return (
      <button
        key={n.id}
        onClick={() => setView(n.id)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          active 
            ? "bg-[#8b5cf6]/15 text-[#a78bfa]" 
            : "text-gray-500 dark:text-white/40 hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
        }`}
      >
        <Icon 
          size={16} 
          className={active ? "text-[#8b5cf6]" : "text-gray-800 dark:text-white/80 group-hover:text-gray-900 dark:text-white"} 
        />
        {n.label}
      </button>
    );
  })}
  <div className="my-2 h-px bg-gray-100 dark:bg-white/10" />
  <button
    onClick={logoutAll}
    disabled={loggingOutAll}
    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors disabled:opacity-40"
  >
    <LogOut size={16} />
    {loggingOutAll ? t("settings.loggingOut") : t("settings.logout")}
  </button>
</aside>

          {/* ===== Контент ===== */}
          <section className="bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-5 sm:p-6">
            {/* ---------- ПРОФИЛЬ ---------- */}
            {view === "profile" && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">{t("settings.profile")}</h2>
                <LanguageSwitcher />

                {/* Аватар */}
                <div className="flex items-center gap-4">
                  {preview ? (
                    <img src={preview} alt="" className="w-20 h-20 rounded-xl object-cover border border-line dark:border-white/10" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex items-center justify-center">
                      <User size={28} className="text-[#B9B8BD]" />
                    </div>
                  )}
                  <div>
                    <Button variant="secondary" icon={Camera} onClick={() => fileRef.current?.click()}>
                      {t("settings.choosePhoto")}
                    </Button>
                    <p className="text-xs text-[#B9B8BD] mt-2">{t("settings.photoHint")}</p>
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
                  <label className={labelCls}>{t("settings.displayName")}</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} />
                </div>

                {/* О себе */}
                <div>
                  <label className={labelCls}>{t("settings.bio")}</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder={t("settings.bioPlaceholder")}
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
                    <div className="flex-1 bg-gray-100 dark:bg-[#1C1C1F] border border-line dark:border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-[#B9B8BD]">
                      @{user.username}
                    </div>
                    <IconButton
                      icon={copied ? CheckCircle2 : Copy}
                      size="iconSm"
                      onClick={copyUsername}
                      title={t("common.copy")}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <Button onClick={saveProfile}>
                    {t("common.save")}
                  </Button>
                  <Button variant="secondary" onClick={() => router.push("/")}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {/* ---------- ОПЛАТА ---------- */}
            {view === "payments" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">{t("settings.payments")}</h2>
                <PaymentShop />
              </div>
            )}

            {/* ---------- ВНЕШНИЙ ВИД ---------- */}
            {view === "appearance" && (
              <div>
                <h2 className="text-lg font-semibold mb-1">{t("settings.appearance")}</h2>
                <p className="text-sm text-[#B9B8BD] mb-4 dark:text-white/60">
                  {t("settings.appearanceHint")}
                </p>
                <AppearanceSettings />
              </div>
            )}

            {/* ---------- УВЕДОМЛЕНИЯ ---------- */}
            {view === "notifications" && (
              <div>
                <h2 className="text-lg font-semibold mb-1">{t("settings.notifications")}</h2>
                <p className="text-sm text-[#B9B8BD] mb-4">{t("settings.pushHint")}</p>
                <PushSettings />
              </div>
            )}

            {/* ---------- РАЗРЕШЕНИЯ ---------- */}
            {view === "permissions" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">{t("settings.permissions")}</h2>
                <DevicePermissionsSection />
              </div>
            )}

            {/* ---------- ЖИВЫЕ СООБЩЕНИЯ ---------- */}
            {view === "messages" && (
              <div>
                <h2 className="text-lg font-semibold mb-4">{t("settings.liveMessages")}</h2>
                <LiveTextSettings />
              </div>
            )}

            {/* ---------- NEBULA ---------- */}
            {view === "nebula" && (
              <div>
                <h2 className="text-lg font-semibold mb-1">Режим Nebula</h2>
                <p className="text-sm text-[#B9B8BD] mb-4 dark:text-white/60">
                  Превращает соцсеть в чистый мессенджер: остаются только чаты
                  (орбита) и настройки Nebula. Всё возвращается назад, когда
                  режим выключен.
                </p>
                <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                  <div className="flex items-center gap-3">
                    <Sparkles size={20} className="text-[#8b5cf6]" />
                    <div>
                      <div className="text-sm font-medium">
                        Режим Nebula (только мессенджер)
                      </div>
                      <div className="text-xs text-gray-500 dark:text-white/40">
                        {isNebula ? "Сейчас включён" : "Сейчас выключен"}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      toggleNebula();
                      if (!isNebula) router.push("/messages");
                    }}
                    role="switch"
                    aria-checked={isNebula}
                    className={`w-12 h-7 rounded-full relative shrink-0 transition-colors ${
                      isNebula ? "bg-[#8b5cf6]" : "bg-gray-300 dark:bg-white/15"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                        isNebula ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* ---------- БЕЗОПАСНОСТЬ ---------- */}
            {view === "security" && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold">{t("settings.security")}</h2>

                {/* 2FA */}
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          securityStatus?.enabled ? "bg-[#2ECC71]/15 text-[#2ECC71]" : "bg-gray-100 dark:bg-white/5 text-[#B9B8BD]"
                        }`}
                      >
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t("settings.twoFa")}</p>
                        <p className={`text-xs mt-0.5 ${securityStatus?.enabled ? "text-[#2ECC71]" : "text-[#B9B8BD]"}`}>
                          {securityStatus?.enabled ? t("settings.twoFaOn") : t("settings.twoFaOff")}
                          {securityStatus?.enabled && t("settings.codesLeft", { n: securityStatus.backup_codes_left })}
                        </p>
                      </div>
                    </div>
                    {!securityStatus?.enabled ? (
                      <Button loading={loading2FA} onClick={start2FASetup} disabled={loading2FA}>
                        {loading2FA ? t("common.loading") : t("common.enable")}
                      </Button>
                    ) : (
                      <Button variant="danger" onClick={() => setShowDisable2FA(true)} disabled={loading2FA}>
                        {t("common.disable")}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-[#B9B8BD] mt-3 leading-relaxed">
                    {securityStatus?.enabled
                      ? t("settings.twoFaOnHint")
                      : t("settings.twoFaOffHint")}
                  </p>
                </div>

                {/* Email */}
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                        <Mail size={18} className="text-[#B9B8BD]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Email</p>
                        <p className="text-xs mt-0.5 text-[#B9B8BD]">{t("settings.emailSoon")}</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-[#B9B8BD] mt-3 leading-relaxed">
                    {t("settings.emailHint")}
                  </p>
                </div>

                {/* Пароль */}
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                      <Lock size={18} className="text-[#a678f7]" />
                    </div>
                    <p className="text-sm font-medium">{t("settings.changePassword")}</p>
                  </div>

                  <form onSubmit={changePassword} className="space-y-4">
                    <div>
                      <label className={labelCls}>{t("settings.currentPassword")}</label>
                      <div className="relative">
                        <input
                          type={showOld ? "text" : "password"}
                          value={oldPassword}
                          onChange={(e) => setOldPassword(e.target.value)}
                          placeholder={t("settings.oldPasswordPh")}
                          required
                          className={inputCls + " pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowOld(!showOld)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-gray-900 dark:text-white transition-colors"
                        >
                          {showOld ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>{t("settings.newPassword")}</label>
                      <div className="relative">
                        <input
                          type={showNew ? "text" : "password"}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder={t("settings.newPasswordPh")}
                          required
                          minLength={6}
                          className={inputCls + " pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNew(!showNew)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-gray-900 dark:text-white transition-colors"
                        >
                          {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>{t("settings.confirmPassword")}</label>
                      <input
                        type={showNew ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("settings.confirmPasswordPh")}
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

                    <Button type="submit" className="w-full">
                      {t("settings.changePassword")}
                    </Button>
                  </form>
                </div>

                {/* Выход со всех устройств */}
                <div className="p-4 rounded-lg border border-[#E74C3C]/30 bg-[#E74C3C]/5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-[#E74C3C]/15 flex items-center justify-center">
                      <ShieldAlert size={18} className="text-[#E74C3C]" />
                    </div>
                    <p className="text-sm font-medium">{t("settings.logoutAll")}</p>
                  </div>
                  <p className="text-sm text-[#B9B8BD] mb-4 leading-relaxed">
                    {t("settings.logoutAllHint")}
                  </p>
                  <Button
                    variant="danger"
                    icon={LogOut}
                    loading={loggingOutAll}
                    disabled={loggingOutAll}
                    className="w-full"
                  >
                    {loggingOutAll ? t("settings.logoutAllProgress") : t("settings.logoutAll")}
                  </Button>
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
    <div className="relative bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold">
          {setupStep === "backup" ? t("settings.twoFaActivated") : t("settings.twoFaSetup")}
        </h3>
        <IconButton
          icon={X}
          size="iconSm"
          onClick={() => !loading2FA && setShow2FASetup(false)}
          disabled={loading2FA}
        />
      </div>

      {setupStep === "scan" && (
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-[#B9B8BD]">
            <p><span className="text-[#a678f7] font-semibold mr-2">1</span>{t("settings.twoFaStep1")}</p>
            <p><span className="text-[#a678f7] font-semibold mr-2">2</span>{t("settings.twoFaStep2")}</p>
            <p><span className="text-[#a678f7] font-semibold mr-2">3</span>{t("settings.twoFaStep3")}</p>
          </div>

          <div className="flex justify-center bg-white rounded-lg p-5">
            <img src={qrCode} alt="QR" className="w-52 h-52" />
          </div>

          <details className="group">
            <summary className="text-sm text-[#B9B8BD] cursor-pointer hover:text-gray-900 dark:text-white transition-colors">
              {t("settings.noCamera")}
            </summary>
            <div className="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
              <p className="text-xs text-[#B9B8BD] mb-1">{t("settings.secretKey")}</p>
              <p className="font-mono text-sm text-gray-900 dark:text-white break-all select-all">{secret}</p>
            </div>
          </details>

          <Button className="w-full" onClick={() => setSetupStep("verify")}>
            {t("common.next")}
          </Button>
        </div>
      )}

      {setupStep === "verify" && (
        <div className="space-y-4">
          <p className="text-sm text-[#B9B8BD]">{t("settings.enter6")}</p>
          <input
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className={inputCls + " text-center text-2xl tracking-[0.5em] font-mono py-3"}
            autoFocus
            disabled={loading2FA}
          />
          <Button
            loading={loading2FA}
            onClick={activate2FA}
            disabled={verifyCode.length !== 6 || loading2FA}
            className="w-full"
          >
            {loading2FA ? t("login.checking") : t("settings.activate2fa")}
          </Button>
          <button
            onClick={() => setSetupStep("scan")}
            disabled={loading2FA}
            className="w-full text-sm text-[#B9B8BD] hover:text-gray-900 dark:text-white transition-colors disabled:opacity-40"
          >
            ← {t("common.back")}
          </button>
        </div>
      )}

      {/* 🆕 ШАГ 3: ПОКАЗ РЕЗЕРВНЫХ КОДОВ — ВНУТРИ МОДАЛКИ */}
      {setupStep === "backup" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h4 className="text-gray-900 dark:text-white font-bold">{t("settings.twoFaActivated")}</h4>
              <p className="text-xs text-gray-600 dark:text-white/50">{t("settings.saveBackup")}</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-xs text-amber-600 dark:text-amber-300 font-semibold mb-2">
              {t("settings.backupWarn")}
            </p>
            <p className="text-[11px] text-amber-200/70 mb-3">
              {t("settings.backupHint")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-gray-100 dark:bg-[#1C1C1F] border border-line dark:border-white/10">
            {backupCodes.map((code, i) => (
              <div
                key={i}
                className="font-mono text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-white/5 px-3 py-2 rounded border border-line dark:border-white/10 text-center tracking-wider select-all"
              >
                {code}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              icon={Copy}
              className="flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(backupCodes.join("\n"));
                  alert(t("settings.codesCopiedLong"));
                } catch {
                  const textarea = document.createElement("textarea");
                  textarea.value = backupCodes.join("\n");
                  document.body.appendChild(textarea);
                  textarea.select();
                  document.execCommand("copy");
                  document.body.removeChild(textarea);
                  alert(t("settings.codesCopied"));
                }
              }}
            >
              {t("settings.copyAll")}
            </Button>
            <Button
              variant="success"
              className="flex-1"
              onClick={() => {
                if (confirm(t("settings.savedCodesConfirm"))) {
                  setShow2FASetup(false);
                }
              }}
            >
              ✓ {t("settings.iSaved")}
            </Button>
          </div>

          <p className="text-[10px] text-gray-500 dark:text-white/30 text-center">
            {t("settings.iSavedHint")}
          </p>
        </div>
      )}
    </div>
  </div>
)}





      {/* ===== MODAL: Disable 2FA ===== */}
      {showDisable2FA && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !loading2FA && setShowDisable2FA(false)} />
          <div className="relative bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{t("settings.disable2fa")}</h3>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                className="text-[#B9B8BD] hover:text-gray-900 dark:text-white transition-colors p-1"
                disabled={loading2FA}
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-[#B9B8BD] mb-4">{t("settings.disable2faHint")}</p>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder={t("settings.codePh")}
              className={inputCls + " text-center text-xl tracking-widest font-mono py-3 mb-4"}
              autoFocus
              disabled={loading2FA}
            />
            <div className="flex gap-3">
              <button onClick={disable2FA} disabled={!disableCode || loading2FA} className={btnDanger + " flex-1"}>
                {loading2FA ? t("login.checking") : t("common.disable")}
              </button>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                disabled={loading2FA}
                className={btnSecondary + " flex-1"}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}