"use client";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { timeAgo } from "@/lib/time";
import { CornerUpLeft, Trash2 } from "lucide-react";

export function CommentNode({ c, currentUser, onDelete, onReply }: {
  c: any; currentUser: any; onDelete: (id: number) => void; onReply: (id: number) => void;
}) {
  const mine = c.mine || c.author?.id === currentUser?.id;
  const author = c.author;
  const [expanded, setExpanded] = useState(false);
  const children = c.children || [];
  return (
    <div className="ml-0 md:ml-4 mt-2 first:mt-0">
      <div className="flex gap-2">
        <Avatar src={author?.avatar_url} name={author?.display_name || author?.username || "?"} size={26} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: "#a78bfa" }}>
            {author?.display_name || author?.username}
          </div>
          <div className="text-sm break-words whitespace-pre-wrap text-gray-800 dark:text-gray-100">
            {c.text}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-500 dark:text-white/40">
            <span>{timeAgo(c.created_at)}</span>
            <button onClick={() => onReply(c.id)} className="hover:text-gray-300">
              <CornerUpLeft size={10} />
            </button>
            {mine && (
              <button onClick={() => onDelete(c.id)} className="hover:text-red-400">
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
      {children.length > 0 && (
        <button onClick={() => setExpanded(!expanded)} className="ml-6 mt-1 text-[10px] text-gray-500 dark:text-white/40 hover:text-gray-300">
          {children.length} ответов · {expanded ? "свернуть" : "развернуть"}
        </button>
      )}
      {expanded && children.map((ch: any) => (
        <CommentNode key={ch.id} c={ch} currentUser={currentUser} onDelete={onDelete} onReply={onReply} />
      ))}
    </div>
  );
}
