"use client";
import { Sidebar } from "@/components/Sidebar";
import { SupportWidget } from "@/components/SupportWidget";
import { Headphones, MessageSquare, Clock, Shield } from "lucide-react";

export default function SupportPage() {
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
                Нажми кнопку в правом нижнем углу — создастся заявка.
                Вся переписка ведётся там же, в виджете.
              </p>
            </div>
            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={18} className="text-yellow-400" />
                <h3 className="font-bold text-white">Время ответа</h3>
              </div>
              <p className="text-sm text-white/60">Обычно 1–3 часа в рабочее время.</p>
            </div>
            <div className="border border-white/10 rounded-xl p-5 bg-white/5">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={18} className="text-green-400" />
                <h3 className="font-bold text-white">Конфиденциальность</h3>
              </div>
              <p className="text-sm text-white/60">Твоё обращение видит только команда поддержки.</p>
            </div>
          </div>

          <div className="text-center text-white/50 text-sm">
            💡 Нажми на фиолетовую кнопку справа внизу, чтобы начать
          </div>
        </div>
      </main>
      <SupportWidget />
    </div>
  );
}