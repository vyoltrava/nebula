// components/SupportWidget.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { Headphones, MessageSquare, X } from "lucide-react";

export function SupportWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chatId, setChatId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  async function startSupport() {
    if (starting) return;
    setStarting(true);
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChatId(data.chat_id);
        router.push(`/messages/${data.chat_id}`);
      }
    } catch {}
    setStarting(false);
    setOpen(false);
  }

  return (
    <>
      {/* Кнопка */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[#8b5cf6] text-white shadow-lg hover:bg-[#7c3aed] transition-all z-50 flex items-center justify-center"
      >
        <Headphones size={20} />
      </button>

      {/* Попап */}
      {open && (
        <div className="fixed bottom-20 right-6 w-72 bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl z-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-white text-sm">Поддержка</p>
            <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-white/50 mb-4">
            Есть вопрос или проблема? Напишите нам — мы ответим.
          </p>
          <button
            onClick={startSupport}
            disabled={starting}
            className="w-full py-2.5 rounded-xl bg-[#8b5cf6] text-white text-sm font-bold hover:bg-[#7c3aed] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <MessageSquare size={14} />
            {starting ? "Открываем..." : "Написать в поддержку"}
          </button>
        </div>
      )}
    </>
  );
}