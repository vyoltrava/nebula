"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { getToken } from "@/lib/auth";
import { Users, FileText, TrendingUp, Wifi, Crown } from "lucide-react";

export function StatsSection({ me }: { me: any }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const token = getToken();
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.ok ? r.json() : null).then((d) => d && setStats(d));
  }, []);

  if (!stats) return <p className="text-white/50 text-center py-12">Загрузка...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ["Пользователей", stats.total_users, Users],
          ["Постов", stats.total_posts, FileText],
          ["Лайков", stats.total_likes, TrendingUp],
          ["Чатов", stats.total_chats, Wifi],
        ].map(([label, val, Icon]: any) => (
          <div key={label} className="border border-white/10 rounded-xl p-5 bg-white/5">
            <Icon size={18} className="text-[#8b5cf6] mb-2" />
            <p className="text-white/50 text-sm">{label}</p>
            <p className="text-2xl sm:text-3xl font-black text-white mt-1">{val}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-white/10 rounded-xl p-5 bg-white/5">
          <div className="flex items-center gap-2 mb-4">
            <Crown size={18} className="text-[#8b5cf6]" />
            <h2 className="font-bold text-white">Топ по подписчикам</h2>
          </div>
          <div className="space-y-2">
            {stats.top_followers.map((u: any, i: number) => (
              <Link key={u.id} href={`/user/${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <span className="text-white/40 font-bold w-6">{i + 1}</span>
                <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-white/40">@{u.username}</p>
                </div>
                <span className="text-[#8b5cf6] font-bold text-sm">{u.followers_count}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="border border-white/10 rounded-xl p-5 bg-white/5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-[#8b5cf6]" />
            <h2 className="font-bold text-white">Топ по постам</h2>
          </div>
          <div className="space-y-2">
            {stats.top_posts.map((u: any, i: number) => (
              <Link key={u.id} href={`/user/${u.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <span className="text-white/40 font-bold w-6">{i + 1}</span>
                <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-white truncate">{u.display_name}</p>
                  <p className="text-xs text-white/40">@{u.username}</p>
                </div>
                <span className="text-[#8b5cf6] font-bold text-sm">{u.posts_count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}