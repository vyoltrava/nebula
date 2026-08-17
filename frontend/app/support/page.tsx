// app/support/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Headphones, MessageSquare, Clock, Shield } from "lucide-react";
import { getToken } from "@/lib/auth";

export default function SupportPage() {
  const router = useRouter();

  async function startSupport() {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/messages/${data.chat_id}`);
      }
    } catch (e) {
      alert("Ошибка соединения");
    }
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[#18181b]">
      <Sidebar />
      <div className="w-px shrink-0 bg-white/10 my-3" />
      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="max-w-2xl mx-auto p-8">
          <div className="flex items-center gap-3 mb-6">
            <Headphones size={32} className="text-[#8b5cf6]" />
            <h1 className="text-3xl font-black text-white">Поддержка</h1>
          </div>

          <div className="space-y-4 mb-8">
            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={18} className="text-[#8b5cf6]" />
                <h3 className="font-bold text-white">Как это работает?</h3>
              </div>
              <p className="text-sm text-white/60">
                Нажми кнопку ниже — создастся личный чат с командой поддержки. 
                Мы отвечаем в течение 24 часов.
              </p>
            </div>

            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={18} className="text-yellow-400" />
                <h3 className="font-bold text-white">Время ответа</h3>
              </div>
              <p className="text-sm text-white/60">
                Обычно отвечаем за 1–3 часа в рабочее время (10:00–22:00 МСК).
              </p>
            </div>

            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-green-400" />
                <h3 className="font-bold text-white">Конфиденциальность</h3>
              </div>
              <p className="text-sm text-white/60">
                Твоё обращение видит только команда поддержки.
              </p>
            </div>
          </div>

          <button
            onClick={startSupport}
            className="w-full py-4 rounded-xl bg-[#8b5cf6] text-white font-black text-lg hover:bg-[#7c3aed] transition-all active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <MessageSquare size={20} />
            Написать в поддержку
          </button>
        </div>
      </main>
    </div>
  );
}