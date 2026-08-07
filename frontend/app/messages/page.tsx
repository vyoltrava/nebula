"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { MessageSquare } from "lucide-react";
import { getToken } from "@/lib/auth";
import { API_URL } from "@/lib/api";

export default function MessagesPage() {
    const [chats, setChats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    function getGlowColor(user: any): string | null {
        if (user?.is_admin) return "#8b5cf6";
        if (user?.is_moderator) return "#3b82f6";
        if (user?.role?.color) return user.role.color;
        return null;
    }

    function glowStyle(user: any): React.CSSProperties | undefined {
        const c = getGlowColor(user);
        if (!c) return undefined;
        return {
            color: c,
            textShadow: `0 0 6px ${c}B3, 0 0 14px ${c}66`,
        };
    }

    async function load() {
        const token = getToken();
        if (!token) {
            router.push("/login");
            return;
        }
        try {
            const res = await fetch('http://${API_URL}/api/chats', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setChats(await res.json());
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        const interval = setInterval(load, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-screen flex overflow-hidden">
            <Sidebar />
            <div className="w-px shrink-0 bg-white/10 my-3" />
            <main className="flex-1 overflow-y-auto border-x border-white/10">
                <div className="p-6 border-b border-white/10 sticky top-0 bg-[#171717]/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-3">
                        <MessageSquare size={24} className="text-[#8b5cf6]" />
                        <h1 className="text-2xl font-black text-white">Сообщения</h1>
                    </div>
                </div>

                {loading && (
                    <p className="p-8 text-center text-white/50">Загрузка...</p>
                )}

                {!loading && chats.length === 0 && (
                    <div className="p-12 text-center">
                        <MessageSquare size={48} className="text-white/20 mx-auto mb-4" />
                        <p className="text-white/60 text-lg">Нет диалогов</p>
                        <p className="text-white/40 text-sm mt-2">
                            Нажмите "Написать" в профиле пользователя, чтобы начать переписку
                        </p>
                    </div>
                )}

                {!loading && chats.map((chat) => {
                    const glow = getGlowColor(chat.other);
                    return (
                        <Link
                            key={chat.id}
                            href={`/messages/${chat.id}`}
                            className={`flex items-center gap-3 p-4 border-b border-white/10 hover:bg-white/5 transition-colors ${
                                chat.unread_count > 0 ? "bg-purple-500/5" : ""
                            }`}
                        >
                            <div
                                className="shrink-0"
                                style={
                                    glow
                                        ? { filter: `drop-shadow(0 0 8px ${glow})` }
                                        : undefined
                                }
                            >
                                <Avatar
                                    src={chat.other.avatar_url}
                                    name={chat.other.display_name}
                                    id={chat.other.id}
                                    size={48}
                                />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <p
                                        className={`font-bold truncate ${glowStyle(chat.other) ? "" : "text-white"}`}
                                        style={glowStyle(chat.other)}
                                    >
                                        {chat.other.display_name}
                                    </p>
                                    {chat.last_message && (
                                        <span className="text-xs text-white/40 shrink-0">
                                            {new Date(chat.last_message.created_at).toLocaleTimeString("ru-RU", {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    )}
                                </div>
                                {chat.last_message ? (
                                    <p className={`text-sm truncate mt-0.5 ${
                                        chat.unread_count > 0 ? "text-white" : "text-white/50"
                                    }`}>
                                        {chat.last_message.text}
                                    </p>
                                ) : (
                                    <p className="text-sm text-white/40 mt-0.5">Начните переписку</p>
                                )}
                            </div>
                            {chat.unread_count > 0 && (
                                <span className="bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                                    {chat.unread_count}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </main>
        </div>
    );
}