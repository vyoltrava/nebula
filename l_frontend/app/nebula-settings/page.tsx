"use client";

/**
 * Nebula: настройки мессенджера - полный функционал основной системы,
 * собранный в удобный Telegram-подобный список. Доступна только в Nebula.
 * Включает: внешний вид, уведомления, доступы, 2FA, смену пароля, аккаунт.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Sun, Bell, ShieldCheck, ChevronRight,
  KeyRound, Lock, Zap, Languages, User, LogOut, Eye, EyeOff,
  AlertCircle, CheckCircle2, Copy, ShieldAlert, X, CreditCard,
} from "lucide-react";
import { useNebulaMode } from "@/lib/useNebula";
import { getToken, clearToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button, IconButton } from "@/components/ui/Button";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { PushSettings } from "@/components/PushSettings";
import { PrivacyTab } from "@/components/settings/PrivacyTab";
import { DevicePermissionsSection } from "@/components/DevicePermissionsSection";
import { LiveTextSettings } from "@/components/LiveTextSettings";
import { PaymentShop } from "@/components/payments/PaymentShop";

export default function NebulaSettingsPage() {
  const router = useRouter();
  const { isNebula, toggleNebula } = useNebulaMode();
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

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

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && isNebula === false) router.replace("/messages");
  }, [ready, isNebula, router]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then(setUser).catch(() => {});

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/security`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => (r.ok ? r.json() : null)).then(setSecurityStatus).catch(() => {});
  }, [router]);  const logout = () => {
    clearToken();
    router.push("/login");
  };

  const changePassword = async (e: React.FormEvent) => {
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
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
    if (res.ok) {
      setPasswordMsg({ text: t("settings.passwordChanged"), type: "ok" });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
    } else {
      const data = await res.json().catch(() => ({}));
      setPasswordMsg({ text: data.detail || t("settings.passwordChangeError"), type: "err" });
    }
  };

  const logoutAll = async () => {
    const token = getToken();
    if (!token) return;
    setLoggingOutAll(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/logout_all`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      logout();
    } catch { setLoggingOutAll(false); }
  };

  const setup2FA = async () => {
    const token = getToken();
    if (!token) return;
    setLoading2FA(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/2fa/setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQrCode(data.qr_code);
        setSecret(data.secret);
        setSetupStep("scan");
        setShow2FASetup(true);
      }
    } catch {}
    setLoading2FA(false);
  };

  const verify2FA = async () => {
    const token = getToken();
    if (!token || !verifyCode) return;
    setLoading2FA(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setBackupCodes(data.backup_codes || []);
        setSetupStep("backup");
        setSecurityStatus((prev: any) => ({ ...prev, two_factor_enabled: true }));
      } else { alert(data.detail || t("settings.invalidCode")); }
    } catch {}
    setLoading2FA(false);
  };

  const disable2FA = async () => {
    const token = getToken();
    if (!token || !disableCode) return;
    setLoading2FA(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: disableCode }),
      });
      if (res.ok) {
        setShowDisable2FA(false);
        setSecurityStatus((prev: any) => ({ ...prev, two_factor_enabled: false }));
      } else { alert(t("settings.invalidCode")); }
    } catch {}
    setLoading2FA(false);
  };

  if (!ready || !isNebula) return null;

  const inputCls = "w-full rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-purple-500 transition-colors";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-white/40 mb-1.5";
  const btnDanger = "rounded-xl bg-[#E74C3C] hover:bg-[#E74C3C]/90 text-white text-sm font-medium py-2.5 px-4 transition-colors disabled:opacity-50";
  const btnSecondary = "rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white text-sm font-medium py-2.5 px-4 transition-colors disabled:opacity-50";

  const sections: { id: string; icon: any; color: string; title: string; hint: string }[] = [
    { id: "appearance", icon: Sun, color: "text-amber-500", title: t("nebula.secAppearance"), hint: t("nebula.hintAppearance") },
    { id: "notifications", icon: Bell, color: "text-blue-500", title: t("nebula.secNotifications"), hint: t("nebula.hintNotifications") },
    { id: "privacy", icon: ShieldCheck, color: "text-cyan-500", title: "Приватность", hint: "Профиль, сообщения, комментарии, подписки" },
    { id: "permissions", icon: Lock, color: "text-emerald-500", title: t("nebula.secPermissions"), hint: t("nebula.hintPermissions") },
    { id: "livetext", icon: Zap, color: "text-yellow-500", title: t("nebula.secLivetext"), hint: t("nebula.hintLivetext") },
    { id: "language", icon: Languages, color: "text-purple-500", title: t("nebula.secLanguage"), hint: t("nebula.hintLanguage") },
    { id: "payments", icon: CreditCard, color: "text-violet-500", title: t("nebula.secPayments"), hint: t("nebula.hintPayments") },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#17171b] text-gray-900 dark:text-white font-sans">
      <div className="fixed top-0 left-0 right-0 h-1 bg-purple-500 z-50" />
      <div className="w-full max-w-lg md:max-w-3xl mx-auto px-4 pt-6 pb-12">
        <button onClick={() => router.push("/messages")} className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} />{t("profile.backToChats")}
        </button>
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
          <Sparkles size={20} className="text-purple-500" />{t("nebula.title")}
        </h1>
        <p className="text-sm text-gray-400 dark:text-white/30 mb-6">{t("nebula.subtitle")}</p>

        {!user && (
          <div className="animate-pulse space-y-4" aria-busy="true">
            <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-white/10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-56 rounded bg-gray-200 dark:bg-white/10" />
                <div className="h-3 w-32 rounded bg-gray-100 dark:bg-white/5" />
              </div>
              <div className="h-9 w-24 rounded-xl bg-gray-200 dark:bg-white/10" />
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-2 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-white/10 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-44 rounded bg-gray-200 dark:bg-white/10" />
                    <div className="h-3 w-64 max-w-full rounded bg-gray-100 dark:bg-white/5" />
                  </div>
                  <div className="w-4 h-4 rounded bg-gray-100 dark:bg-white/5" />
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-5 space-y-3">
              <div className="h-3.5 w-40 rounded bg-gray-200 dark:bg-white/10" />
              <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
              <div className="h-10 w-full rounded-xl bg-gray-100 dark:bg-white/5" />
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 p-4 mb-4 flex items-center gap-3">
          <Sparkles size={20} className="text-purple-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t("nebula.modeTitle")}</div>
            <div className="text-xs text-gray-400 dark:text-white/30">{t("nebula.modeOn")}</div>
          </div>
          <button onClick={() => { toggleNebula(); router.push("/"); }} className="rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2 px-4 transition-colors">{t("nebula.turnOff")}</button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 overflow-hidden mb-4">
          {sections.map((s) => {
            const isOpen = open === s.id;
            const Icon = s.icon;
            return (
              <div key={s.id} className="border-b border-line dark:border-white/10 last:border-0">
                <button onClick={() => setOpen(isOpen ? null : s.id)} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left">
                  <Icon size={20} className={`${s.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.title}</div>
                    <div className="text-xs text-gray-400 dark:text-white/30">{s.hint}</div>
                  </div>
                  <ChevronRight size={16} className={`text-gray-300 dark:text-white/20 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5">
                    {s.id === "appearance" && <AppearanceSettings />}
                    {s.id === "notifications" && <PushSettings />}
                    {s.id === "privacy" && <PrivacyTab />}
                    {s.id === "permissions" && <DevicePermissionsSection />}
                    {s.id === "livetext" && <LiveTextSettings />}
                    {s.id === "language" && <LanguageSwitcher />}
                    {s.id === "payments" && <PaymentShop />}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 overflow-hidden mb-4">
          <div className="px-5 py-4 border-b border-line dark:border-white/10">
            <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-red-500" /><h2 className="text-sm font-bold">{t("nebula.security")}</h2></div>
          </div>
          <div className="px-5 py-4 border-b border-line dark:border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center"><Lock size={18} className="text-red-500" /></div>
              <div className="flex-1">
                <div className="text-sm font-medium">{t("nebula.twoFa")}</div>
                <div className="text-xs text-gray-400 dark:text-white/30">{securityStatus?.two_factor_enabled ? t("nebula.twoFaOn") : t("nebula.twoFaOff")}</div>
              </div>
            </div>
            {securityStatus?.two_factor_enabled ? (
              <button onClick={() => setShowDisable2FA(true)} className="rounded-xl bg-[#E74C3C]/10 hover:bg-[#E74C3C]/20 text-[#E74C3C] text-sm font-medium py-2 px-4 transition-colors">{t("nebula.disable2fa")}</button>
            ) : (
              <button onClick={setup2FA} disabled={loading2FA} className="rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2 px-4 transition-colors disabled:opacity-50">{loading2FA ? t("common.loading") : t("nebula.enable2fa")}</button>
            )}
          </div>
          <div className="px-5 py-4 border-b border-line dark:border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><KeyRound size={18} className="text-amber-500" /></div>
              <div className="text-sm font-medium">{t("settings.changePassword")}</div>
            </div>
            <form onSubmit={changePassword} className="space-y-3">
              <div>
                <label className={labelCls}>{t("settings.currentPassword")}</label>
                <div className="relative">
                  <input type={showOld ? "text" : "password"} value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder={t("settings.oldPasswordPh")} required className={inputCls + " pr-10"} />
                  <button type="button" onClick={() => setShowOld(!showOld)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-gray-900 dark:hover:text-white transition-colors">{showOld ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t("settings.newPassword")}</label>
                <div className="relative">
                  <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("settings.newPasswordPh")} required minLength={6} className={inputCls + " pr-10"} />
                  <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B9B8BD] hover:text-gray-900 dark:hover:text-white transition-colors">{showNew ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div>
                <label className={labelCls}>{t("settings.confirmPassword")}</label>
                <input type={showNew ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t("settings.confirmPasswordPh")} required minLength={6} className={inputCls} />
              </div>
              {passwordMsg && (
                <div className={`p-3 rounded-lg border text-sm font-medium flex items-center gap-2 ${passwordMsg.type === "ok" ? "bg-[#2ECC71]/10 border-[#2ECC71]/30 text-[#2ECC71]" : "bg-[#E74C3C]/10 border-[#E74C3C]/30 text-[#E74C3C]"}`}>
                  {passwordMsg.type === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{passwordMsg.text}
                </div>
              )}
              <Button type="submit" className="w-full">{t("settings.changePassword")}</Button>
            </form>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#E74C3C]/10 flex items-center justify-center"><ShieldAlert size={18} className="text-[#E74C3C]" /></div>
              <div className="flex-1"><div className="text-sm font-medium">{t("settings.logoutAll")}</div><div className="text-xs text-gray-400 dark:text-white/30">{t("settings.logoutAllHint")}</div></div>
            </div>
            <Button variant="danger" icon={LogOut} loading={loggingOutAll} disabled={loggingOutAll} className="w-full" onClick={logoutAll}>
              {loggingOutAll ? t("settings.logoutAllProgress") : t("settings.logoutAll")}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#1e1e23] border border-line dark:border-white/10 divide-y divide-line dark:divide-white/10 overflow-hidden">
          <button onClick={() => router.push("/nebula-profile")} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-left">
            <User size={20} className="text-gray-400 shrink-0" />
            <div className="flex-1 min-w-0"><div className="text-sm font-medium">{t("nebula.account")}</div><div className="text-xs text-gray-400 dark:text-white/30">{user?.username ? `@${user.username}` : t("nebula.profileLabel")}</div></div>
            <ChevronRight size={16} className="text-gray-300 dark:text-white/20" />
          </button>
          <button onClick={logout} className="w-full flex items-center gap-3 px-5 py-4 text-[#E74C3C] hover:bg-[#E74C3C]/10 transition-colors text-left">
            <LogOut size={20} className="shrink-0" /><span className="flex-1 text-sm font-medium">{t("profile.logout")}</span>
          </button>
        </div>
      </div>

      {show2FASetup && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !loading2FA && setShow2FASetup(false)} />
          <div className="relative bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{setupStep === "backup" ? t("settings.twoFaActivated") : t("settings.twoFa")}</h3>
              <IconButton icon={X} size="iconSm" onClick={() => !loading2FA && setShow2FASetup(false)} disabled={loading2FA} />
            </div>
            {setupStep === "scan" && (
              <div className="space-y-4">
                <div className="space-y-2 text-sm text-[#B9B8BD]">
                  <p><span className="text-[#a678f7] font-semibold mr-2">1</span>{t("settings.twoFaStep1")}</p>
                  <p><span className="text-[#a678f7] font-semibold mr-2">2</span>{t("settings.twoFaStep2")}</p>
                  <p><span className="text-[#a678f7] font-semibold mr-2">3</span>{t("settings.twoFaStep3")}</p>
                </div>
                <div className="flex justify-center bg-white rounded-lg p-5"><img src={qrCode} alt="QR" className="w-52 h-52" /></div>
                <details className="group">
                  <summary className="text-sm text-[#B9B8BD] cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors">{t("settings.noCamera")}</summary>
                  <div className="mt-3 p-3 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10">
                    <p className="text-xs text-[#B9B8BD] mb-1">{t("settings.secretKey")}</p>
                    <p className="font-mono text-sm text-gray-900 dark:text-white break-all select-all">{secret}</p>
                  </div>
                </details>
                <Button className="w-full" onClick={() => setSetupStep("verify")}>{t("common.next")}</Button>
              </div>
            )}
            {setupStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm text-[#B9B8BD]">{t("settings.enter6")}</p>
                <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder={t("settings.codePh")} className={inputCls + " text-center text-xl tracking-widest font-mono py-3"} autoFocus disabled={loading2FA} />
                <Button className="w-full" onClick={verify2FA} disabled={!verifyCode || loading2FA}>{loading2FA ? t("login.checking") : t("settings.activate2fa")}</Button>
              </div>
            )}
            {setupStep === "backup" && (
              <div className="space-y-4">
                <p className="text-sm text-[#B9B8BD]">{t("settings.backupHint")} <span className="text-[#E74C3C] text-xs ml-1">{t("settings.backupWarn")}</span></p>
                <div className="grid grid-cols-2 gap-2">{backupCodes.map((code) => (<div key={code} className="bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-lg px-3 py-2 text-center text-sm font-mono tracking-wider select-all">{code}</div>))}</div>
                <div className="flex gap-2">
                  <Button icon={Copy} className="flex-1" onClick={async () => { try { await navigator.clipboard.writeText(backupCodes.join("\n")); alert(t("settings.codesCopiedLong")); } catch { const textarea = document.createElement("textarea"); textarea.value = backupCodes.join("\n"); document.body.appendChild(textarea); textarea.select(); document.execCommand("copy"); document.body.removeChild(textarea); alert(t("settings.codesCopied")); } }}>{t("settings.copyAll")}</Button>
                  <Button variant="success" className="flex-1" onClick={() => { if (confirm(t("settings.savedCodesConfirm"))) setShow2FASetup(false); }}>✓ {t("settings.iSaved")}</Button>
                </div>
                <p className="text-[10px] text-gray-500 dark:text-white/30 text-center">{t("settings.iSavedHint")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showDisable2FA && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => !loading2FA && setShowDisable2FA(false)} />
          <div className="relative bg-gray-100 dark:bg-[#1E1E23] border border-line dark:border-white/10 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{t("settings.disable2fa")}</h3>
              <button onClick={() => !loading2FA && setShowDisable2FA(false)} className="text-[#B9B8BD] hover:text-gray-900 dark:hover:text-white transition-colors p-1" disabled={loading2FA}><X size={20} /></button>
            </div>
            <p className="text-sm text-[#B9B8BD] mb-4">{t("settings.disable2faHint")}</p>
            <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder={t("settings.codePh")} className={inputCls + " text-center text-xl tracking-widest font-mono py-3 mb-4"} autoFocus disabled={loading2FA} />
            <div className="flex gap-3">
              <button onClick={disable2FA} disabled={!disableCode || loading2FA} className={btnDanger + " flex-1"}>{loading2FA ? t("login.checking") : t("common.disable")}</button>
              <button onClick={() => !loading2FA && setShowDisable2FA(false)} disabled={loading2FA} className={btnSecondary + " flex-1"}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}