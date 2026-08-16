"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, clearToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import {
  Lock,
  Eye,
  EyeOff,
  LogOut,
  ShieldAlert,
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

type View = "root" | "profile" | "permissions" | "messages" | "security";

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [view, setView] = useState<View>("root");

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
    if (f) setPreview(URL.createObjectURL(f));
  }

  function copyUsername() {
    navigator.clipboard.writeText(user?.username || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function goBack() {
    if (view !== "root") setView("root");
    else router.push("/");
  }

  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/50">
          <RefreshCw size={16} className="animate-spin text-[#a855f7]" />
          <span className="text-[11px] uppercase tracking-[0.3em]">загрузка</span>
        </div>
      </div>
    );

  const labelCls = "block text-[10px] uppercase tracking-[0.25em] text-white/40 mb-2";

  const underlineInput =
    "w-full bg-transparent border-b border-white/20 rounded-none px-0 py-2 text-white placeholder-white/25 focus:outline-none focus:border-[#a855f7] transition-colors";

  const btnPrimary =
    "uppercase text-[11px] tracking-[0.25em] border border-[#a855f7] text-[#c084fc] hover:bg-[#a855f7] hover:text-black px-5 py-2.5 transition-all";

  const btnGhost =
    "uppercase text-[11px] tracking-[0.25em] border border-white/15 text-white/50 hover:text-white hover:border-white/50 px-5 py-2.5 transition-colors";

  const tabs: { id: View; label: string }[] = [
    { id: "profile", label: "profile" },
    { id: "permissions", label: "permissions" },
    { id: "messages", label: "messages" },
    { id: "security", label: "security" },
  ];

  const title = view === "root" ? "settings" : view;

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ fontFamily: "'Segoe UI', 'Zune', -apple-system, system-ui, sans-serif" }}
    >
      <style>{`
        @keyframes zuneIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .zune-in { animation: zuneIn .25s ease-out; }
      `}</style>

      {/* ===== МОБИЛЬНАЯ ШАПКА: назад + 4 кнопки ===== */}
      <div className="lg:hidden sticky top-0 z-40 backdrop-blur-xl bg-black/30 border-b border-white/5">
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <button
            onClick={goBack}
            className="w-8 h-8 rounded-full border border-white/20 text-white/60 flex items-center justify-center hover:text-white hover:border-white/60 transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">{title}</span>
        </div>
        <nav className="flex gap-6 px-4 pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`shrink-0 text-[10px] uppercase tracking-[0.25em] pb-1 border-b transition-colors ${
                view === t.id ? "text-white border-[#a855f7]" : "text-white/35 border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="px-5 sm:px-10 lg:px-16 max-w-3xl mx-auto pb-28 pt-1 lg:pt-4">
        {/* ===== ОГРОМНОЕ СЛОВО, ОБРЕЗАННОЕ СВЕРХУ И СПРАВА ===== */}
        <div className="overflow-hidden pointer-events-none select-none">
          <h1
            key={title}
            className="zune-in font-extralight lowercase leading-none whitespace-nowrap text-[#c084fc] drop-shadow-[0_0_25px_rgba(168,85,247,0.45)] text-[17vw] lg:text-[7.5rem] -mt-[0.45em]"
          >
            {title}
          </h1>
        </div>

        {/* ==================== ROOT: СПИСОК КАК НА ФОТО ==================== */}
        {view === "root" && (
          <nav key="root" className="zune-in mt-10 space-y-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className="block w-full text-left uppercase text-[12px] font-semibold tracking-[0.35em] text-white/85 hover:text-white hover:pl-2 transition-all py-2.5"
              >
                {t.label}
              </button>
            ))}
          </nav>
        )}

        {/* ==================== PROFILE ==================== */}
        {view === "profile" && (
          <div key="profile" className="zune-in mt-8 lg:mt-10">
            <button
              onClick={() => setView("root")}
              className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors mb-8"
            >
              <ArrowLeft size={12} /> settings
            </button>

            <div className="space-y-7">
              {/* Аватар */}
              <div className="flex items-center gap-5">
                <div className="relative group">
                  {preview ? (
                    <img
                      src={preview}
                      alt=""
                      className="w-20 h-20 rounded-md object-cover ring-1 ring-[#a855f7]/70 shadow-[0_0_20px_rgba(168,85,247,0.35)]"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-md bg-white/5 ring-1 ring-white/15 flex items-center justify-center">
                      <User size={26} className="text-white/25" />
                    </div>
                  )}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[#a855f7] hover:bg-[#9333ea] flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.6)] transition-colors"
                    title="Сменить аватар"
                  >
                    <Camera size={12} />
                  </button>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/40 mb-1.5">аватарка</p>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-sm text-[#c084fc] hover:text-white transition-colors underline underline-offset-4 decoration-[#a855f7]/50"
                  >
                    выбрать фото
                  </button>
                  <p className="text-[9px] text-white/30 mt-1.5 tracking-wider">jpg · png · gif · webp · max 5 mb</p>
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
                <label className={labelCls}>имя</label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="ваше имя"
                  className={underlineInput}
                />
              </div>

              {/* О себе */}
              <div>
                <label className={labelCls}>о себе</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="расскажи о себе"
                  className="w-full bg-transparent border-b border-white/20 rounded-none px-0 py-2 text-white placeholder-white/25 focus:outline-none focus:border-[#a855f7] resize-none transition-colors"
                />
                <p className="text-[9px] text-white/25 mt-1 text-right tracking-[0.2em]">
                  <span className={bio.length > 450 ? "text-amber-400" : ""}>{bio.length}</span> / 500
                </p>
              </div>

              {/* Username */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">username</span>
                <span className="px-3 py-1 rounded-full border border-[#a855f7]/50 text-[#c084fc] text-sm shadow-[0_0_12px_rgba(168,85,247,0.25)]">
                  @{user.username}
                </span>
                <button
                  onClick={copyUsername}
                  className="p-1 text-white/30 hover:text-white transition-colors"
                  title="Скопировать"
                >
                  {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>

              {/* Кнопки */}
              <div className="flex flex-wrap gap-4 pt-2">
                <button onClick={saveProfile} className={btnPrimary}>
                  + сохранить
                </button>
                <button onClick={() => router.push("/")} className={btnGhost}>
                  отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PERMISSIONS ==================== */}
        {view === "permissions" && (
          <div key="permissions" className="zune-in mt-8 lg:mt-10">
            <button
              onClick={() => setView("root")}
              className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors mb-8"
            >
              <ArrowLeft size={12} /> settings
            </button>
            <div className="space-y-10">
              <PushSettings />
              <DevicePermissionsSection />
            </div>
          </div>
        )}

        {/* ==================== MESSAGES ==================== */}
        {view === "messages" && (
          <div key="messages" className="zune-in mt-8 lg:mt-10">
            <button
              onClick={() => setView("root")}
              className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors mb-8"
            >
              <ArrowLeft size={12} /> settings
            </button>
            <LiveTextSettings />
          </div>
        )}

        {/* ==================== SECURITY ==================== */}
        {view === "security" && (
          <div key="security" className="zune-in mt-8 lg:mt-10">
            <button
              onClick={() => setView("root")}
              className="hidden lg:flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 hover:text-white transition-colors mb-8"
            >
              <ArrowLeft size={12} /> settings
            </button>

            <div className="space-y-9">
              {/* 2FA */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                    <ShieldCheck
                      size={12}
                      className={securityStatus?.enabled ? "text-emerald-400" : "text-white/30"}
                    />
                    two-factor auth
                  </p>
                  {securityStatus?.enabled ? (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" /> on
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/30" /> off
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/45 leading-relaxed mb-3">
                  {securityStatus?.enabled
                    ? "Аккаунт защищён. При входе потребуется код из аутентификатора."
                    : "Дополнительный уровень защиты: код из Google Authenticator при входе."}
                </p>

                {securityStatus?.enabled && (
                  <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-400/80 mb-3">
                    резервных кодов: {securityStatus.backup_codes_left}/10
                  </p>
                )}

                {!securityStatus?.enabled ? (
                  <button
                    onClick={start2FASetup}
                    disabled={loading2FA}
                    className="uppercase text-[11px] tracking-[0.25em] border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/15 px-5 py-2.5 transition-colors disabled:opacity-40"
                  >
                    + включить 2fa
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDisable2FA(true)}
                    disabled={loading2FA}
                    className="uppercase text-[11px] tracking-[0.25em] border border-red-500/50 text-red-400 hover:bg-red-500/15 px-5 py-2.5 transition-colors disabled:opacity-40"
                  >
                    − отключить 2fa
                  </button>
                )}
              </div>

              {/* Email */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                    <Mail size={12} className="text-amber-400" /> email
                  </p>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-amber-400/80">🚧 скоро</span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed">
                На доработке: восстановление пароля, уведомления, подтверждение email.
                </p>
              </div>

              {/* Пароль */}
              <div>
                <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40 mb-5">
                  <Lock size={12} className="text-[#a855f7]" /> сменить пароль
                </p>

                <form onSubmit={changePassword} className="space-y-5">
                  <div className="relative">
                    <input
                      type={showOld ? "text" : "password"}
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="текущий пароль"
                      required
                      className={underlineInput + " pr-8"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOld(!showOld)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-1"
                    >
                      {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="новый пароль (мин. 6)"
                      required
                      minLength={6}
                      className={underlineInput + " pr-8"}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors p-1"
                    >
                      {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <input
                    type={showNew ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="повторите пароль"
                    required
                    minLength={6}
                    className={underlineInput}
                  />

                  {passwordMsg && (
                    <p
                      className={`flex items-center gap-2 text-xs ${
                        passwordMsg.type === "ok" ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {passwordMsg.type === "ok" ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      {passwordMsg.text}
                    </p>
                  )}

                  <button type="submit" className={btnPrimary + " w-full"}>
                    + обновить пароль
                  </button>
                </form>
              </div>

              {/* Выход со всех устройств */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-red-400/80">
                    <ShieldAlert size={12} /> log out all
                  </p>
                  <p className="text-xs text-white/40 mt-1.5 leading-relaxed">
                    Завершить все сессии на всех устройствах
                  </p>
                </div>
                <button
                  onClick={logoutAll}
                  disabled={loggingOutAll}
                  className="shrink-0 w-11 h-11 rounded-full border border-red-500/60 text-red-400 hover:bg-red-500/15 hover:shadow-[0_0_18px_rgba(239,68,68,0.4)] flex items-center justify-center transition-all disabled:opacity-40"
                  title="Выйти со всех устройств"
                >
                  {loggingOutAll ? <RefreshCw size={15} className="animate-spin" /> : <LogOut size={15} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===== MODAL: 2FA Setup ===== */}
      {show2FASetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !loading2FA && setShow2FASetup(false)}
          />
          <div className="relative bg-[#141416] border border-white/15 rounded-md p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-[0_0_60px_rgba(168,85,247,0.15)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-extralight lowercase text-[#c084fc]">2fa setup</h3>
              <button
                onClick={() => !loading2FA && setShow2FASetup(false)}
                className="text-white/40 hover:text-white transition-colors p-1"
                disabled={loading2FA}
              >
                <X size={18} />
              </button>
            </div>

            {setupStep === "scan" && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs text-white/60">
                    <span className="text-[#a855f7] mr-2">1</span>Откройте Google Authenticator / Authy
                  </p>
                  <p className="text-xs text-white/60">
                    <span className="text-[#a855f7] mr-2">2</span>Нажмите «+» → «Сканировать QR-код»
                  </p>
                  <p className="text-xs text-white/60">
                    <span className="text-[#a855f7] mr-2">3</span>Отсканируйте код ниже
                  </p>
                </div>

                <div className="flex justify-center bg-white p-5">
                  <img src={qrCode} alt="QR" className="w-52 h-52" />
                </div>

                <details className="group">
                  <summary className="text-[10px] uppercase tracking-[0.25em] text-white/40 cursor-pointer hover:text-white/80 transition-colors">
                    нет камеры? ключ вручную
                  </summary>
                  <div className="mt-3 p-3 border border-amber-500/30">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400 mb-1">secret key</p>
                    <p className="font-mono text-sm text-amber-200 break-all select-all">{secret}</p>
                  </div>
                </details>

                <button onClick={() => setSetupStep("verify")} className={btnPrimary + " w-full"}>
                  далее →
                </button>
              </div>
            )}

            {setupStep === "verify" && (
              <div className="space-y-5">
                <p className="text-xs text-white/60">Введите 6-значный код из аутентификатора:</p>
                <input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-transparent border-b border-white/20 px-0 py-3 text-white text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:border-emerald-400 transition-colors"
                  autoFocus
                  disabled={loading2FA}
                />
                <button
                  onClick={activate2FA}
                  disabled={verifyCode.length !== 6 || loading2FA}
                  className="w-full uppercase text-[11px] tracking-[0.25em] border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/15 py-3 transition-colors disabled:opacity-40"
                >
                  {loading2FA ? "проверка..." : "✓ активировать 2fa"}
                </button>
                <button
                  onClick={() => setSetupStep("scan")}
                  disabled={loading2FA}
                  className="w-full text-[10px] uppercase tracking-[0.25em] text-white/40 hover:text-white transition-colors disabled:opacity-40"
                >
                  ← назад
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
          <div className="relative bg-[#141416] border border-white/15 rounded-md p-6 max-w-sm w-full shadow-[0_0_60px_rgba(239,68,68,0.1)]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-extralight lowercase text-red-400">disable 2fa</h3>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                className="text-white/40 hover:text-white transition-colors p-1"
                disabled={loading2FA}
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-white/60 mb-5">Код из аутентификатора или резервный код:</p>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="code"
              className="w-full bg-transparent border-b border-white/20 px-0 py-3 text-white text-center text-xl tracking-widest font-mono focus:outline-none focus:border-red-400 mb-6 transition-colors"
              autoFocus
              disabled={loading2FA}
            />
            <div className="flex gap-3">
              <button
                onClick={disable2FA}
                disabled={!disableCode || loading2FA}
                className="flex-1 uppercase text-[11px] tracking-[0.25em] border border-red-500/50 text-red-400 hover:bg-red-500/15 py-3 transition-colors disabled:opacity-40"
              >
                {loading2FA ? "..." : "отключить"}
              </button>
              <button
                onClick={() => !loading2FA && setShowDisable2FA(false)}
                disabled={loading2FA}
                className={btnGhost + " flex-1"}
              >
                отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}