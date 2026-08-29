"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, UserPlus, Search, MessageCircle } from "lucide-react";
import { getToken } from "@/lib/auth";
import { Avatar } from "@/components/Avatar";
import { RoleBadge } from "@/components/RoleBadge";
import { useI18n } from "@/lib/i18n/LanguageProvider";

type FollowedUser = {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  role?: { id?: number; color?: string; level?: number } | null;
  selected_badge_id?: number | null;
  custom_badge_url?: string | null;
};

export function NebulaCircleModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [following, setFollowing] = useState<FollowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me || !me.username) { setLoading(false); return; }
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${me.username}/following`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => { setFollowing(Array.isArray(data) ? data : []); setLoading(false); })
          .catch(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = following.filter((u) =>
    (u.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.username || "").toLowerCase().includes(search.toLowerCase())
  );

  const goToProfile = (username: string) => {
    onClose();
    router.push(`/nebula-user/${username}`);
  };return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]" onClick={onClose} />
      <div className="fixed inset-0 z-[301] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md bg-paper dark:bg-[#1f1f23] border border-line dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
          <div className="p-4 border-b border-line dark:border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#8b5cf6]/15 flex items-center justify-center">
                <UserPlus size={18} className="text-[#8b5cf6]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{t("circle.title")}</h3>
                <p className="text-xs text-gray-500 dark:text-white/40">{t("circle.count", { n: following.length })}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-white/50 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("circle.searchPh")}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="space-y-1 p-1" aria-busy="true">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 animate-pulse">
                    <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-white/10 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-36 rounded bg-gray-200 dark:bg-white/10" />
                      <div className="h-3 w-24 rounded bg-gray-100 dark:bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                  <UserPlus size={24} className="text-gray-400 dark:text-white/20" />
                </div>
                <p className="text-sm text-gray-500 dark:text-white/40 text-center">
                  {search ? t("circle.emptySearch") : t("circle.empty")}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors group">
                    <button onClick={() => goToProfile(u.username)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar src={u.avatar_url} name={u.display_name} id={u.id} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{u.display_name}</p>
                          <RoleBadge user={u} size="sm" />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-white/40 truncate">@{u.username}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { onClose(); router.push(`/messages?user=${u.username}`); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-[#8b5cf6] hover:bg-[#8b5cf6]/10 transition-all opacity-0 group-hover:opacity-100"
                      title={t("circle.message")}
                    >
                      <MessageCircle size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}