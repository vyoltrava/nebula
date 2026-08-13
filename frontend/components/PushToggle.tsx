"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { enablePush, disablePush, isPushSubscribed, isPushSupported } from "@/lib/push";
import { getToken } from "@/lib/auth";

export function PushToggle() {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setSubscribed);
  }, []);

  async function toggle() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      if (subscribed) {
        await disablePush(token);
        setSubscribed(false);
      } else {
        const res = await enablePush(token);
        if (res.ok) {
          setSubscribed(true);
        } else if (res.error === "denied") {
          alert("Уведомления запрещены в браузере. Разрешите их в настройках сайта (иконка замка у адресной строки).");
        } else if (res.error === "unsupported") {
          alert("Браузер не поддерживает пуш-уведомления");
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!isPushSupported()) return null;

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`p-2.5 sm:p-2 rounded-lg transition-colors active:scale-95 ${
        subscribed ? "text-[#8b5cf6] bg-[#8b5cf6]/10" : "text-white/60 hover:text-[#8b5cf6]"
      }`}
      title={subscribed ? "Выключить пуш-уведомления" : "Включить пуш-уведомления"}
    >
      {subscribed ? <Bell size={19} /> : <BellOff size={19} />}
    </button>
  );
}