"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Post } from "@/components/Post";
import { getToken } from "@/lib/auth";

export default function UserProfilePage() {
  const pathname = usePathname();
  const userId = pathname.split("/").pop();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    if (!userId) return;

    fetch(`http://localhost:8000/api/users/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setProfile);

    fetch(`http://localhost:8000/api/users/${userId}/posts`)
      .then((r) => r.json())
      .then(setPosts);

    const token = getToken();
    if (token) {
      fetch(`http://localhost:8000/api/users/${userId}/is-following`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setFollowing(data.following);
        });
    }
  }, [userId]);

  async function toggleFollow() {
    const token = getToken();
    if (!token) return;
    const res = await fetch(`http://localhost:8000/api/users/${userId}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setFollowing(data.following);
      const p = await fetch(`http://localhost:8000/api/users/${userId}`).then((r) => r.json());
      setProfile(p);
    }
  }

  if (!profile) return <div className="p-8 text-white/60">Загрузка...</div>;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar />

      <div className="w-px shrink-0 bg-white/10 my-3" />

      <main className="flex-1 overflow-y-auto border-x border-white/10">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-start gap-5">
            {profile.avatar_url ? (
              <img
                src={`http://localhost:8000${profile.avatar_url}`}
                alt=""
                className="w-24 h-24 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border border-white/20 bg-white/5" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-white">{profile.display_name}</h1>
                  <p className="text-white/50">@{profile.username}</p>
                </div>
                <button
                  onClick={toggleFollow}
                  className={`px-5 py-2 rounded-full border font-bold transition-all ${
                    following
                      ? "border-purple-400/50 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                      : "border-white/20 text-white/80 hover:bg-white/10 hover:border-white/40 hover:text-white"
                  }`}
                >
                  {following ? "Читаю" : "Читать"}
                </button>
              </div>
              <div className="flex gap-6 mt-4 text-sm font-semibold text-white/70">
                <span>{profile.posts_count} постов</span>
                <span>{profile.followers_count} подписчиков</span>
                <span>{profile.following_count} читает</span>
              </div>
            </div>
          </div>
        </div>

        {posts.map((post) => (
          <Post key={post.id} {...post} />
        ))}
        {posts.length === 0 && (
          <p className="p-8 text-center text-white/50">Пока нет постов</p>
        )}
      </main>
    </div>
  );
}