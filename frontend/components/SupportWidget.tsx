"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { Headphones, X, MessageSquare, Loader2 } from "lucide-react";

export function SupportWidget() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [existingChatId, setExistingChatId] = useState<number | null>(null);

  useEffect(() => {
    const checkTicket = async () => {
      const token = getToken();
      if (!token) { setChecking(false); return; }
      
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/my-ticket`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.has_ticket) {
            setExistingChatId(data.chat_id);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setChecking(false);
      }
    };
    checkTicket();
  }, []);

  const handleStartSupport = async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        router.push(`/messages/${data.chat_id}`);
      } else {
        alert("Ошибка создания тикета");
      }
    } catch (e) {
      alert("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  if (!getToken()) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      >
        {isOpen ? <X size={24} /> : <Headphones size={24} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-80 bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Headphones size={18} className="text-[#8b5cf6]" />
              Поддержка
            </h3>
            <p className="text-xs text-white/50 mt-1">Мы обычно отвечаем в течение часа</p>
          </div>
          
          <div className="p-4">
            {checking ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="animate-spin text-white/50" size={24} />
              </div>
            ) : existingChatId ? (
              <button
                onClick={() => router.push(`/messages/${existingChatId}`)}
                className="w-full py-3 bg-[#8b5cf6]/20 hover:bg-[#8b5cf6]/30 text-[#a78bfa] border border-[#8b5cf6]/30 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <MessageSquare size={18} />
                Продолжить диалог
              </button>
            ) : (
              <button
                onClick={handleStartSupport}
                disabled={loading}
                className="w-full py-3 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
                Написать в поддержку
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}