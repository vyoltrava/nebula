"use client";
import { useEffect, useState } from "react";
import { X, RefreshCw, Quote, MessageCircle } from "lucide-react";
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

  useEffect(() => {
    apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/echo`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setNodes(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  const root = nodes.find(n => n.id === postId);
  const childrenMap = new Map<number, EchoNode[]>();
  nodes.forEach(n => {
    if (n.repost_of_id) {
      if (!childrenMap.has(n.repost_of_id)) childrenMap.set(n.repost_of_id, []);
      childrenMap.get(n.repost_of_id)!.push(n);
    }
  });

  const renderNode = (node: EchoNode, depth: number = 0) => {
    const children = childrenMap.get(node.id) || [];
    return (
      <div key={node.id} className={`${depth > 0 ? "ml-6 pl-4 border-l-2 border-purple-500/30" : ""} mb-4`}>
        <div className="flex gap-3">
          <Link href={`/${node.handle?.replace("@", "")}`} className="shrink-0" onClick={e => e.stopPropagation()}>
            <Avatar src={node.author_avatar} name={node.author} id={node.author_id} size={32} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <Link href={`/${node.handle?.replace("@", "")}`} className="font-bold text-white hover:underline" onClick={e => e.stopPropagation()}>
                {node.author}
              </Link>
              <span className="text-white/50">{node.handle}</span>
              <span className="text-white/40">· {timeAgo(node.created_at)}</span>
              {node.is_quote ? (
                <span className="text-cyan-400 text-xs flex items-center gap-1"><Quote size={12} /> Цитата</span>
              ) : node.id !== postId ? (
                <span className="text-emerald-400 text-xs flex items-center gap-1"><RefreshCw size={12} /> Репост</span>
              ) : null}
            </div>
            {node.text && <p className="text-white/90 text-sm mt-1 whitespace-pre-wrap break-words">{node.text}</p>}
            <div className="flex items-center gap-3 mt-2">
               <span className="text-white/40 text-xs flex items-center gap-1">❤️ {node.likes_count}</span>
               <Link href={`/post/${node.id}`} className="text-[#8b5cf6] text-xs hover:underline" onClick={e => e.stopPropagation()}>
                 Открыть пост →
               </Link>
            </div>
          </div>
        </div>
        {children.length > 0 && (
          <div className="mt-3">
            {children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[80vh] bg-[#1f1f23] border border-white/15 rounded-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageCircle size={20} className="text-[#8b5cf6]" />
            Эхо поста
          </h2>
          <button onClick={onClose} className="text-white/60 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-white/50 py-8">Загрузка...</div>
          ) : nodes.length <= 1 ? (
            <div className="text-center text-white/50 py-8">Пока никто не репостнул и не процитировал этот пост.</div>
          ) : (
            root && renderNode(root)
          )}
        </div>
      </div>
    </div>
  );
}