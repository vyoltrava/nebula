"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getAccounts, getActiveAccountId, switchAccount, removeAccount, clearToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Plus, LogOut, X, Check } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import type { StoredAccount } from "@/lib/auth";

export function AccountSwitcher({ 
  variant = "classic", 
  isOpen: propOpen, 
  onClose 
}: { 
  variant?: "classic" | "orbit" | "dock"; 
  isOpen?: boolean; 
  onClose?: () => void;
}) {
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const router = useRouter();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  const isOrbit = variant === "orbit";
  const isOpen = propOpen ?? false;

  useEffect(() => {
    const refresh = () => { 
      setAccounts(getAccounts()); 
      setActiveId(getActiveAccountId()); 
    };
    refresh();
    window.addEventListener("accounts-changed", refresh);
    return () => window.removeEventListener("accounts-changed", refresh);
  }, []);

  const activeAccount = accounts.find(a => a.userId === activeId);
  const safeActive = activeAccount ?? accounts[0];

  const handleAddAccount = () => { onClose?.(); router.push("/login?add_account=1"); };
  const handleLogout = () => { clearToken(); onClose?.(); router.push("/"); };

  // 🌌 РЕЖИМ ОРБИТЫ (Модалка по центру)
  if (isOrbit) {
    if (!isOpen) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]" onClick={() => onClose?.()} />
        <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
          <div ref={ref} className="w-full max-w-xs bg-ivory dark:bg-[#1f1f23] border border-line dark:border-white/15 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-line dark:border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t("account.accounts")}</h3>
              <IconButton icon={X} size="iconSm" onClick={() => onClose?.()} />
            </div>
            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
              {accounts.map((acc) => (
                <div key={acc.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group">
                  <button onClick={() => { switchAccount(acc.userId); onClose?.(); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Avatar src={acc.avatarUrl} name={acc.displayName} id={acc.userId} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{acc.displayName}</p>
                      <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{acc.username}</p>
                    </div>
                    {acc.userId === activeId && <Check size={16} className="text-[#8b5cf6] shrink-0" />}
                  </button>
                  {accounts.length > 1 && (
                    <IconButton
                      icon={X}
                      variant="danger"
                      size="iconSm"
                      onClick={() => { removeAccount(acc.userId); onClose?.(); }}
                      className="opacity-0 group-hover:opacity-100"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-line dark:border-white/10 space-y-1">
              <button onClick={handleAddAccount} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-colors">
                <Plus size={18} /> <span className="text-sm font-semibold">{t("account.addAccount")}</span>
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut size={18} /> <span className="text-sm font-semibold">{t("nav.logout")}</span>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null; // Для classic/dock не используем, там своя логика в Sidebar
}