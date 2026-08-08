"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth";
import { Heart, MessageCircle, UserPlus } from "lucide-react";

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetch("http://localhost:8000/api/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setNotifs);
  }, []);

  async function markRead(id: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`http://localhost:8000/api/notifications/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  const icons = {
    like: <Heart size={16} fill="currentColor" />,
    reply: <MessageCircle size={16} />,
    follow: <UserPlus size={16} />,
  };

  const texts = {
    like: "лайкнул(а) ваш пост",
    reply: "ответил(а) на ваш пост",
    follow: "подписался(ась) на вас",
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#F6F1E6] text-black">
      <div className="flex-1 overflow-y-auto border-x border-black max-w-2xl mx-auto">
        <h1 className="text-2xl font-black p-4 border-b-2 border-black sticky top-0 bg-[#F6F1E6]">
          Уведомления
        </h1>

        {notifs.length === 0 && (
          <p className="p-8 text-center opacity-60">Пока нет уведомлений</p>
        )}

        {notifs.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.read && markRead(n.id)}
            className={`p-4 border-b border-black/20 cursor-pointer hover:bg-black/5 ${
              !n.read ? "bg-yellow-50" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-black bg-white flex items-center justify-center shrink-0">
                {icons[n.type as keyof typeof icons]}
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-bold">{n.actor.display_name}</span>{" "}
                  {texts[n.type as keyof typeof texts]}
                </p>
                <p className="text-xs opacity-60 mt-1">
                  {new Date(n.created_at).toLocaleString("ru-RU")}
                </p>
              </div>
              {!n.read && (
                <div className="w-2 h-2 rounded-full bg-black shrink-0 mt-2" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}