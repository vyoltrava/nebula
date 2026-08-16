"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getToken } from "@/lib/auth";
import { ShieldCheck, Mail, Key, AlertTriangle, Check, X, Copy, RefreshCw } from "lucide-react";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 2FA Setup
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [setupStep, setSetupStep] = useState<"scan" | "verify" | "backup">("scan");

  // Email
  const [emailInput, setEmailInput] = useState("");

  // Disable 2FA
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    fetchStatus();
  }, []);

  async function fetchStatus() {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/2fa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStatus(await res.json());
    } catch {}
    setLoading(false);
  }

  async function start2FASetup() {
    const token = getToken();
    if (!token) return;
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
      }
    } catch {}
  }

  async function activate2FA() {
    const token = getToken();
    if (!token) return;
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
        alert("✅ 2FA активирована! Сохраните резервные коды.");
        setShow2FASetup(false);
        fetchStatus();
      } else {
        const err = await res.json();
        alert(err.detail || "Ошибка активации");
      }
    } catch {}
  }

  async function disable2FA() {
    const token = getToken();
    if (!token) return;
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
        fetchStatus();
      } else {
        const err = await res.json();
        alert(err.detail || "Ошибка");
      }
    } catch {}
  }

  async function linkEmail() {
    const token = getToken();
    if (!token) return;
    try {
      const form = new FormData();
      form.append("email", emailInput);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        alert("Email привязан!");
        setEmailInput("");
        fetchStatus();
      } else {
        const err = await res.json();
        alert(err.detail || "Ошибка");
      }
    } catch {}
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-white">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden bg-[#171717]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">🔐 Безопасность</h1>

        {/* ===== 2FA ===== */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck size={22} className={status?.enabled ? "text-green-400" : "text-white/40"} />
            <div>
              <h2 className="font-bold text-white">Двухфакторная аутентификация (2FA)</h2>
              <p className="text-sm text-white/50">
                {status?.enabled ? "✅ Включена" : "❌ Выключена"}
              </p>
            </div>
          </div>

          {status?.enabled && (
            <p className="text-xs text-white/40 mb-3">
              Резервных кодов осталось: {status.backup_codes_left}/10
            </p>
          )}

          {!status?.enabled ? (
            <button
              onClick={start2FASetup}
              className="px-4 py-2 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 transition-colors"
            >
              Включить 2FA
            </button>
          ) : (
            <button
              onClick={() => setShowDisable2FA(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 font-bold hover:bg-red-600/30 border border-red-500/30 transition-colors"
            >
              Отключить 2FA
            </button>
          )}
        </div>

        {/* ===== EMAIL ===== */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <Mail size={22} className={status?.email_linked ? "text-green-400" : "text-white/40"} />
            <div>
              <h2 className="font-bold text-white">Email</h2>
              <p className="text-sm text-white/50">
                {status?.email_linked ? `✅ ${status.email}` : "❌ Не привязан"}
              </p>
            </div>
          </div>

          {!status?.email_linked ? (
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-[#8b5cf6]"
              />
              <button
                onClick={linkEmail}
                disabled={!emailInput}
                className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed] disabled:opacity-40 transition-colors"
              >
                Привязать
              </button>
            </div>
          ) : (
            <button
              onClick={async () => {
                const token = getToken();
                await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/email`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${token}` },
                });
                fetchStatus();
              }}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 font-bold hover:bg-red-600/30 border border-red-500/30 transition-colors text-sm"
            >
              Отвязать email
            </button>
          )}
        </div>

        {/* ===== МОДАЛКА: Настройка 2FA ===== */}
        {show2FASetup && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80" onClick={() => setShow2FASetup(false)} />
            <div className="relative bg-[#1f1f23] border border-white/15 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Настройка 2FA</h3>
                <button onClick={() => setShow2FASetup(false)} className="text-white/50 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              {setupStep === "scan" && (
                <div className="space-y-4">
                  <p className="text-sm text-white/60">
                    1. Откройте Google Authenticator или Authy
                  </p>
                  <p className="text-sm text-white/60">
                    2. Нажмите «+» → «Сканировать QR-код»
                  </p>
                  <p className="text-sm text-white/60">
                    3. Отсканируйте этот QR-код:
                  </p>
                  <div className="flex justify-center bg-white rounded-xl p-4">
                    <img src={qrCode} alt="QR" className="w-48 h-48" />
                  </div>
                  <details>
                    <summary className="text-xs text-white/40 cursor-pointer">
                      Нет камеры? Введите ключ вручную
                    </summary>
                    <p className="mt-2 font-mono text-sm text-amber-300 break-all bg-white/5 p-3 rounded-lg">
                      {secret}
                    </p>
                  </details>
                  <button
                    onClick={() => setSetupStep("verify")}
                    className="w-full py-2.5 rounded-lg bg-[#8b5cf6] text-white font-bold hover:bg-[#7c3aed]"
                  >
                    Далее →
                  </button>
                </div>
              )}

              {setupStep === "verify" && (
                <div className="space-y-4">
                  <p className="text-sm text-white/60">
                    Введите 6-значный код из приложения:
                  </p>
                  <input
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-[#8b5cf6]"
                    autoFocus
                  />
                  <button
                    onClick={activate2FA}
                    disabled={verifyCode.length !== 6}
                    className="w-full py-2.5 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-40"
                  >
                    Активировать
                  </button>
                  <button
                    onClick={() => setSetupStep("scan")}
                    className="w-full py-2 text-white/50 hover:text-white text-sm"
                  >
                    ← Назад
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== МОДАЛКА: Отключение 2FA ===== */}
        {showDisable2FA && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80" onClick={() => setShowDisable2FA(false)} />
            <div className="relative bg-[#1f1f23] border border-white/15 rounded-2xl p-6 max-w-sm w-full">
              <h3 className="text-lg font-bold text-white mb-3">Отключить 2FA</h3>
              <p className="text-sm text-white/50 mb-4">
                Введите код из аутентификатора или резервный код:
              </p>
              <input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                placeholder="Код"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/15 text-white text-center text-xl tracking-wider font-mono focus:outline-none focus:border-red-500 mb-4"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={disable2FA}
                  disabled={!disableCode}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 disabled:opacity-40"
                >
                  Отключить
                </button>
                <button
                  onClick={() => setShowDisable2FA(false)}
                  className="flex-1 py-2.5 rounded-lg bg-white/10 text-white font-bold hover:bg-white/15"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}