"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { getToken } from "@/lib/auth";
import { onFeedRefresh } from "@/lib/events";
import { Avatar } from "./Avatar";
import { UserPrefix } from "./UserPrefixProvider";
import { useI18n } from "@/lib/i18n/LanguageProvider";


export function RightPanel() {
  const [q, setQ] = useState("");
  const [tags, setTags] = useState<any[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const router = useRouter();
  const { t } = useI18n();

  async function load() {
    const tagsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/tags/popular`);
    if (tagsRes.ok) setTags(await tagsRes.json());

    const token = getToken();
    if (token) {
      const authRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/recommended`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (authRes.ok) setAuthors(await authRes.json());
    }
  }

  useEffect(() => {
    load();
    return onFeedRefresh(() => load());
  }, []);

  async function follow(userId: number) {
    const token = getToken();
    if (!token) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${userId}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    load();
  }

  return (
    <aside className="hidden lg:flex w-80 shrink-0 overflow-y-auto p-5 flex-col gap-4 backdrop-blur-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <label className="flex items-center gap-2 border border-line dark:border-white/15 rounded-xl px-4 py-2 bg-gray-100 dark:bg-white/5 focus-within:border-[#8b5cf6] focus-within:bg-gray-100 dark:bg-white/10 transition-all">
        <Search size={16} className="text-gray-600 dark:text-white/50" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search")}
            className="w-full bg-transparent focus:outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40"
          />
        </label>
      </form>

      <section className="border border-line dark:border-white/15 rounded-2xl p-4 bg-white/5 backdrop-blur-sm">
        <h2 className="font-black mb-3 text-gray-900 dark:text-white">{t("panel.popularTags")}</h2>
        {tags.length === 0 && <p className="text-sm text-gray-600 dark:text-white/50">{t("panel.noTags")}</p>}
        <div className="space-y-2">
          {tags.map((tag) => (
            <Link key={tag.name} href={`/tag/${tag.name}`} className="block hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg p-2 -mx-2 transition-colors">
              <p className="font-bold text-sm text-[#8b5cf6]">#{tag.name}</p>
              <p className="text-xs text-gray-600 dark:text-white/50">{t("panel.postsCount", { n: tag.count })}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border border-line dark:border-white/15 rounded-2xl p-4 bg-white/5 backdrop-blur-sm">
        <h2 className="font-black mb-3 text-gray-900 dark:text-white">{t("panel.suggestedAuthors")}</h2>
        {authors.length === 0 && <p className="text-sm text-gray-600 dark:text-white/50">{t("panel.noSuggestions")}</p>}
        <div className="space-y-3">
          {authors.map((a) => (
            <div key={a.id} className="flex items-center gap-3">
              <Avatar src={a.avatar_url} name={a.display_name} id={a.id} size={36} />

              <div className="flex-1 leading-tight">
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserPrefix userId={a.id} prefix={a.prefix} size={13} />
                  <Link href={`/${a.username}`} className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#8b5cf6] transition-colors truncate">
                    {a.display_name}
                  </Link>
                </div>
                <p className="text-xs text-gray-600 dark:text-white/50">{t("panel.followersCount", { n: a.followers_count })}</p>
              </div>
              <button
                onClick={() => follow(a.id)}
                className="text-xs font-bold px-3 py-1 rounded-full border border-line dark:border-white/20 text-gray-800 dark:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 hover:border-gray-300 dark:hover:border-white/40 hover:text-gray-900 dark:hover:text-white transition-all"
              >
                {t("post.follow")}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Кнопка команды проекта — в самом низу правой панели */}
      <Link
        href="/team"
        className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-line dark:border-white/15 bg-gradient-to-r from-white/5 to-white/10 text-gray-900 dark:text-white hover:from-[#8b5cf6]/20 hover:to-[#8b5cf6]/10 hover:border-[#8b5cf6]/50 transition-all font-semibold text-sm"
      >
        <Users size={18} />
        {t("panel.team")}
      </Link>
    </aside>
  );
}