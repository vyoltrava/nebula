"use client";
import { useEffect, useState } from "react";
import { X, Quote, RefreshCw, Star, Sparkles, ChevronDown } from "lucide-react";
import { Avatar } from "./Avatar";
import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { IconButton } from "@/components/ui/Button";

interface EchoNode {
  id: number;
  author_id: number;
  author: string;
  handle: string;
  author_avatar?: string | null;
  text: string;
  media_url?: string | null;
  created_at: string;
  repost_of_id: number | null;
  is_quote: boolean;
  likes_count: number;
}

export function EchoModal({ postId, onClose }: { postId: number; onClose: () => void }) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<EchoNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/echo`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setNodes(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  const root = nodes.find(n => n.repost_of_id === null);
  const childrenMap = new Map<number, EchoNode[]>();
  nodes.forEach(n => {
    if (n.repost_of_id) {
      if (!childrenMap.has(n.repost_of_id)) childrenMap.set(n.repost_of_id, []);
      childrenMap.get(n.repost_of_id)!.push(n);
    }
  });

  // Рекурсивный рендер уровня дерева
  const renderLevel = (node: EchoNode, depth: number = 0) => {
    const children = childrenMap.get(node.id) || [];
    const isRoot = depth === 0;

    return (
      <div key={node.id} className="flex flex-col items-center">
        {/* Карточка поста */}
        <div className={`w-full max-w-lg rounded-2xl border transition-all duration-300 ${
          isRoot 
            ? "bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border-purple-500/50 shadow-[0_0_30px_rgba(168,85,247,0.2)]" 
            : "bg-white/[0.04] border-white/15 hover:border-purple-400/40 hover:bg-white/[0.06]"
        }`}>
          <div className="p-4">
            <div className="flex gap-3">
              <Link 
                href={`/${node.handle?.replace("@", "")}`} 
                className="shrink-0" 
                onClick={e => e.stopPropagation()}
              >
                <Avatar src={node.author_avatar} name={node.author} id={node.author_id} size={40} />
              </Link>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Link 
                    href={`/${node.handle?.replace("@", "")}`} 
                    className="font-bold text-white hover:text-purple-300 transition-colors" 
                    onClick={e => e.stopPropagation()}
                  >
                    {node.author}
                  </Link>
                  <span className="text-white/40 text-xs">{node.handle}</span>
                  <span className="text-white/25 text-xs">· {timeAgo(node.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {node.is_quote ? (
                    <span className="text-cyan-400 text-[11px] flex items-center gap-1 bg-cyan-400/10 px-2 py-0.5 rounded-full border border-cyan-400/20">
                      <Quote size={10} /> {t("echo.quote")}
                    </span>
                  ) : isRoot ? (
                    <span className="text-yellow-400 text-[11px] flex items-center gap-1 bg-yellow-400/10 px-2 py-0.5 rounded-full border border-yellow-400/20">
                      <Star size={10} fill="currentColor" /> {t("echo.original")}
                    </span>
                  ) : (
                    <span className="text-emerald-400 text-[11px] flex items-center gap-1 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20">
                      <RefreshCw size={10} /> {t("echo.repost")}
                    </span>
                  )}
                </div>

                {node.text && (
                  <p className="text-white/85 text-sm mt-2 whitespace-pre-wrap break-words leading-relaxed">
                    {node.text}
                  </p>
                )}

                <div className="flex items-center gap-4 mt-3">
                  <span className="text-white/40 text-xs flex items-center gap-1.5">
                    <span className="text-pink-400">♥</span> {node.likes_count}
                  </span>
                  <Link 
                    href={`/post/${node.id}`} 
                    className="text-purple-400 text-xs hover:text-purple-300 hover:underline underline-offset-2 transition-colors" 
                    onClick={e => e.stopPropagation()}
                  >
                    {t("echo.openPost")}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Стрелка и дети */}
        {children.length > 0 && (
          <div className="flex flex-col items-center mt-0">
            {/* Вертикальная линия-стрелка */}
            <div className="flex flex-col items-center py-2">
              <div className="w-0.5 h-6 bg-gradient-to-b from-purple-500/60 to-purple-400/40" />
              <ChevronDown size={18} className="text-purple-400/70 -mt-1" />
              <div className="w-0.5 h-4 bg-gradient-to-b from-purple-400/40 to-transparent" />
            </div>

            {/* Горизонтальная линия если несколько детей */}
            {children.length > 1 && (
              <div className="relative w-full flex justify-center mb-2">
                <div 
                  className="h-0.5 bg-purple-500/30 rounded-full"
                  style={{ 
                    width: `calc(${Math.min(children.length * 280, 800)}px - 40px)`,
                    maxWidth: '90%'
                  }}
                />
              </div>
            )}

            {/* Дети в ряд (или колонкой если много) */}
            <div className={`flex ${children.length > 2 ? 'flex-col' : 'flex-row flex-wrap justify-center'} gap-4 w-full`}>
              {children.map((child, idx) => (
                <div key={child.id} className="flex flex-col items-center">
                  {/* Вертикальная ветка к каждому ребёнку */}
                  {children.length > 1 && (
                    <div className="flex flex-col items-center -mt-2 mb-0">
                      <div className="w-0.5 h-5 bg-purple-500/40" />
                    </div>
                  )}
                  {renderLevel(child, depth + 1)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const totalCount = nodes.length;
  const quoteCount = nodes.filter(n => n.is_quote && n.repost_of_id !== null).length;
  const repostCount = nodes.filter(n => !n.is_quote && n.repost_of_id !== null).length;

  return (
    <div 
      className="fixed inset-0 bg-black/90 backdrop-blur-md z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200" 
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl max-h-[85vh] bg-[#0d0d14] border border-purple-500/20 rounded-3xl shadow-[0_0_60px_rgba(168,85,247,0.15)] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-300" 
        onClick={e => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="relative flex items-center justify-between p-5 border-b border-white/10 bg-gradient-to-r from-purple-900/20 via-indigo-900/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Sparkles size={22} className="text-purple-400" />
              <div className="absolute inset-0 blur-md bg-purple-400/50" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">
                {t("echo.title")}
              </h2>
              <div className="flex items-center gap-3 text-xs text-white/50 mt-0.5">
                <span className="flex items-center gap-1">
                  <Star size={10} className="text-yellow-400" fill="currentColor" />
                  {t("echo.total", { n: totalCount })}
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw size={10} className="text-emerald-400" />
                  {t("echo.reposts", { n: repostCount })}
                </span>
                <span className="flex items-center gap-1">
                  <Quote size={10} className="text-cyan-400" />
                  {t("echo.quotes", { n: quoteCount })}
                </span>
              </div>
            </div>
          </div>
          <IconButton
            icon={X}
            size="icon"
            onClick={onClose}
            className="rounded-full"
          />
        </div>

        {/* Контент */}
        <div className="relative flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-purple-500/30 scrollbar-track-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
                <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-cyan-500/20 border-b-cyan-400 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
              </div>
              <p className="text-white/40 text-sm">{t("echo.loading")}</p>
            </div>
          ) : nodes.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Sparkles size={28} className="text-purple-400/50" />
              </div>
              <p className="text-white/50 text-sm text-center max-w-xs">
                {t("echo.empty")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              {root && renderLevel(root)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}