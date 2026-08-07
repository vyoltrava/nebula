"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = "https://nebula-qqm2.onrender.com";

export default function TechPage() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  async function checkAuthAndLoad() {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      // Сначала проверяем кто мы
      const meRes = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!meRes.ok) {
        router.push("/login");
        return;
      }

      const meData = await meRes.json();
      setMe(meData);

      // Проверяем права
      if (!meData.is_admin && !meData.permissions?.includes("tech_access")) {
        router.push("/");
        return;
      }

      // Теперь загружаем пользователей
      await loadUsers(token);
    } catch (err) {
      console.error("Auth error:", err);
      router.push("/login");
    }
  }

  async function loadUsers(token: string) {
    try {
      console.log("Запрашиваем:", `${API_URL}/api/admin/users`);
      
      const res = await fetch(`${API_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("Статус ответа:", res.status);

      if (!res.ok) {
        const text = await res.text();
        console.error("Ошибка:", text);
        setError(`Ошибка ${res.status}: ${text}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      console.log("Получено пользователей:", data.length);
      setUsers(data);
      setLoading(false);
    } catch (err) {
      console.error("Критическая ошибка:", err);
      setError(`Ошибка сети: ${err}`);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#18181b] flex items-center justify-center">
        <div className="text-white text-xl">Проверка авторизации...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#18181b] flex items-center justify-center p-8">
        <div className="bg-red-500/20 border border-red-500 rounded-xl p-6 max-w-2xl">
          <h2 className="text-red-400 text-xl font-bold mb-2">Ошибка</h2>
          <p className="text-white">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#18181b] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-black text-white">
            Техническая панель (ТЕСТ)
          </h1>
          <div className="text-right">
            <p className="text-white font-bold">{me?.display_name}</p>
            <p className="text-white/60 text-sm">@{me?.username}</p>
          </div>
        </div>
        
        <div className="bg-green-500/20 border border-green-500 rounded-xl p-4 mb-6">
          <p className="text-green-400 font-bold">
            ✅ Загружено пользователей: {users.length}
          </p>
          <p className="text-white/60 text-sm mt-1">
            API: {API_URL}/api/admin/users
          </p>
        </div>

        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-all"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-bold">{user.display_name}</p>
                  <p className="text-white/60 text-sm">@{user.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/40 text-xs">ID: {user.id}</p>
                  {user.is_admin && (
                    <span className="text-xs bg-white text-black px-2 py-0.5 rounded font-bold">
                      Admin
                    </span>
                  )}
                  {user.is_moderator && !user.is_admin && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded font-bold">
                      Mod
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}