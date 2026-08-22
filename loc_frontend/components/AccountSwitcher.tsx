"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { getAccounts, getActiveAccountId, switchAccount, removeAccount, clearToken } from "@/lib/auth";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { ChevronDown, Plus, LogOut, X, Check } from "lucide-react";
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
  const [internalOpen, setInternalOpen] = useState(false);
  const router = useRouter();
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  const isOrbit = variant === "orbit";
  const isOpen = isOrbit ? (propOpen ?? false) : internalOpen;
  const handleClose = () => isOrbit ? onClose?.() : setInternalOpen(false);

  useEffect(() => {
    const refresh = () => { 
      setAccounts(getAccounts()); 
      setActiveId(getActiveAccountId()); 
    };
    refresh();
    window.addEventListener("accounts-changed", refresh);
    return () => window.removeEventListener("accounts-changed", refresh);
  }, []);

  useEffect(() => {
    if (!isOpen || isOrbit) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setInternalOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, isOrbit]);

  const activeAccount = accounts.find(a => a.userId === activeId);

  if (!isOrbit && (!activeAccount || accounts.length === 0)) {
    return null;
  }

  const safeActive = activeAccount ?? accounts[0];

  const handleAddAccount = () => { 
    handleClose(); 
    router.push("/login?add_account=1"); 
  };
  
  const handleLogoutAll = () => {
    if (confirm(t("account.logoutAllConfirm"))) {
      clearToken(); 
      router.push("/");
    }
  };

  if (isOrbit) {
    if (!isOpen) return null;
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]" onClick={handleClose} />
        <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
          <div ref={ref} className="w-full max-w-xs bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{t("account.accounts")}</h3>
              <button onClick={handleClose} className="text-white/50 hover:text-white p-1"><X size={16} /></button>
            </div>
            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
              {accounts.map((acc) => (
                <div key={acc.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                  <button onClick={() => { switchAccount(acc.userId); handleClose(); }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Avatar src={acc.avatarUrl} name={acc.displayName} id={acc.userId} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{acc.displayName}</p>
                      <p className="text-xs text-white/40 truncate">@{acc.username}</p>
                    </div>
                    {acc.userId === activeId && <Check size={16} className="text-[#8b5cf6] shrink-0" />}
                  </button>
                  {accounts.length > 1 && (
                    <button onClick={() => removeAccount(acc.userId)} className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-white/10 space-y-1">
              <button onClick={handleAddAccount} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-colors">
                <Plus size={18} /> <span className="text-sm font-semibold">{t("account.addAccount")}</span>
              </button>
              <button onClick={handleLogoutAll} className="w-full flex items-center gap-3 p-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors">
                <LogOut size={18} /> <span className="text-sm font-semibold">{t("account.logoutAll")}</span>
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div ref={ref} className="relative w-full">
      <button onClick={() => setInternalOpen(!internalOpen)} className={`w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all group ${variant === "dock" ? "justify-center" : ""}`}>
        <div className="shrink-0 relative">
          <Avatar src={safeActive.avatarUrl} name={safeActive.displayName} id={safeActive.userId} size={variant === "dock" ? 32 : 36} />
          {accounts.length > 1 && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#8b5cf6] border-2 border-[#171717] flex items-center justify-center">
              <span className="text-[9px] font-bold text-white">{accounts.length}</span>
            </div>
          )}
        </div>
        {variant !== "dock" && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-semibold text-white truncate">{safeActive.displayName}</p>
              <p className="text-xs text-white/40 truncate">@{safeActive.username}</p>
            </div>
            <ChevronDown size={16} className={`text-white/40 transition-transform ${internalOpen ? "rotate-180" : ""}`} />
          </>
        )}
      </button>

      {internalOpen && (
        <div className={`absolute z-50 bottom-full mb-2 ${variant === "dock" ? "left-1/2 -translate-x-1/2 w-64" : "left-0 right-0"} bg-[#1f1f23] border border-white/15 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 duration-200`}>
          <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
            {accounts.map((acc) => (
              <div key={acc.userId} className="flex items-center gap-2 group">
                <button onClick={() => { switchAccount(acc.userId); setInternalOpen(false); }} className="flex items-center gap-2 flex-1 min-w-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors text-left">
                  <Avatar src={acc.avatarUrl} name={acc.displayName} id={acc.userId} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white truncate">{acc.displayName}</p>
                    <p className="text-[10px] text-white/40 truncate">@{acc.username}</p>
                  </div>
                  {acc.userId === activeId && <Check size={12} className="text-[#8b5cf6] shrink-0" />}
                </button>
                {accounts.length > 1 && (
                  <button onClick={() => removeAccount(acc.userId)} className="p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100">
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-1.5 border-t border-white/10 space-y-0.5">
            <button onClick={handleAddAccount} className="w-full flex items-center gap-2 p-2 rounded-lg text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-colors text-xs font-semibold">
              <Plus size={14} /> {t("account.addAccount")}
            </button>
            <button onClick={handleLogoutAll} className="w-full flex items-center gap-2 p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-xs font-semibold">
              <LogOut size={14} /> {t("account.logoutAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}