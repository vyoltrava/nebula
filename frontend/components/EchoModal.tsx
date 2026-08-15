"use client";
import { useEffect, useState, useRef } from "react";
import { X, Quote, RefreshCw, Star, Sparkles } from "lucide-react";
import { Avatar } from "./Avatar";
import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { apiFetch } from "@/lib/api";

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
  const [nodes, setNodes] = useState<EchoNode[]>([]);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/echo`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setNodes(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  // 🌌 Анимация звёзд на фоне
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const stars: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Генерируем звёзды
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        speed: Math.random() * 0.3 + 0.05,
        opacity: Math.random() * 0.7 + 0.3,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      stars.forEach(star => {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.fill();

        // Мерцание
        star.opacity += (Math.random() - 0.5) * 0.02;
        star.opacity = Math.max(0.1, Math.min(1, star.opacity));

        // Движение
        star.y -= star.speed;
        if (star.y < -5) {
          star.y = canvas.height + 5;
          star.x = Math.random() * canvas.width;
        }
      });
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const root = nodes.find(n => n.repost_of_id === null);
  const childrenMap = new Map<number, EchoNode[]>();
  nodes.forEach(n => {
    if (n.repost_of_id) {
      if (!childrenMap.has(n.repost_of_id)) childrenMap.set(n.repost_of_id, []);
      childrenMap.get(n.repost_of_id)!.push(n);
    }
  });

  const renderNode = (node: EchoNode, depth: number = 0) => {
    const children = childrenMap.get(node.id) || [];
    const isRoot = node.repost_of_id === null;

    return (
      <div key={node.id} className="relative">
        {/* 🕸️ Линия связи (паутинка) */}
        {depth > 0 && (
          <div className="absolute left-5 top-0 w-px h-full -ml-px">
            <div className="w-full h-full bg-gradient-to-b from-purple-500/60 via-cyan-400/40 to-transparent" />
            {/* Узел соединения */}
            <div className="absolute -left-1 top-0 w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
          </div>
        )}

        <div className={`${depth > 0 ? "ml-10 pl-4" : ""} mb-5 relative`}>
          <div className={`relative rounded-2xl border transition-all duration-300 hover:scale-[1.01] ${
            isRoot 
              ? "bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.3)]" 
              : "bg-white/[0.03] border-white/10 hover:border-purple-500/30 hover:bg-white/[0.05]"
          }`}>
            {/* ✨ Свечение для корня */}
            {isRoot && (
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-pink-500/20 blur-sm opacity-50" />
            )}

            <div className="relative p-4">
              <div className="flex gap-3">
                <Link 
                  href={`/${node.handle?.replace("@", "")}`} 
                  className="shrink-0 relative group" 
                  onClick={e => e.stopPropagation()}
                >
                  {/* Орбита вокруг аватарки */}
                  <div className="absolute -inset-1.5 rounded-full border border-purple-500/30 group-hover:border-purple-400/60 transition-colors" />
                  <Avatar src={node.author_avatar} name={node.author} id={node.author_id} size={36} />
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
                    <span className="text-white/40">{node.handle}</span>
                    <span className="text-white/30">· {timeAgo(node.created_at)}</span>
                    
                    {node.is_quote ? (
                      <span className="text-cyan-400 text-xs flex items-center gap-1 bg-cyan-400/10 px-2 py-0.5 rounded-full">
                        <Quote size={10} /> Цитата
                      </span>
                    ) : !isRoot ? (
                      <span className="text-emerald-400 text-xs flex items-center gap-1 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                        <RefreshCw size={10} /> Репост
                      </span>
                    ) : (
                      <span className="text-yellow-400 text-xs flex items-center gap-1 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                        <Star size={10} fill="currentColor" /> Оригинал
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
                      Открыть пост →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Рекурсивный рендер детей */}
          {children.length > 0 && (
            <div className="mt-3 relative">
              {children.map(child => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
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
        className="w-full max-w-2xl max-h-[85vh] bg-[#0d0d14] border border-purple-500/20 rounded-3xl shadow-[0_0_60px_rgba(168,85,247,0.15)] flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-300" 
        onClick={e => e.stopPropagation()}
      >
        {/* 🌌 Canvas со звёздами */}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none opacity-40" 
        />

        {/* Туманность сверху */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-purple-900/20 via-transparent to-transparent pointer-events-none" />

        {/* Шапка */}
        <div className="relative flex items-center justify-between p-5 border-b border-white/10 bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Sparkles size={22} className="text-purple-400" />
              <div className="absolute inset-0 blur-md bg-purple-400/50" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">
                Эхо поста
              </h2>
              <div className="flex items-center gap-3 text-xs text-white/50 mt-0.5">
                <span className="flex items-center gap-1">
                  <Star size={10} className="text-yellow-400" fill="currentColor" />
                  {totalCount} всего
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw size={10} className="text-emerald-400" />
                  {repostCount} репостов
                </span>
                <span className="flex items-center gap-1">
                  <Quote size={10} className="text-cyan-400" />
                  {quoteCount} цитат
                </span>
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-white/50 hover:text-white hover:bg-white/10 p-2 rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Контент */}
        <div className="relative flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-purple-500/30 scrollbar-track-transparent">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
                <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-cyan-500/20 border-b-cyan-400 animate-spin [animation-direction:reverse] [animation-duration:1.5s]" />
              </div>
              <p className="text-white/40 text-sm">Сканируем космос...</p>
            </div>
          ) : nodes.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Sparkles size={28} className="text-purple-400/50" />
              </div>
              <p className="text-white/50 text-sm text-center max-w-xs">
                Пока никто не репостнул и не процитировал этот пост. Эхо появится, когда кто-то поделится им.
              </p>
            </div>
          ) : (
            root && renderNode(root)
          )}
        </div>

        {/* Нижняя туманность */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0d0d14] via-[#0d0d14]/80 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}