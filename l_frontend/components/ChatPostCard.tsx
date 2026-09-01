"use client";
import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { mediaUrl } from "@/lib/media";
import { timeAgo } from "@/lib/time";
import { CommentNode } from "@/components/ChatCommentNode";
import {
  MessageCircle, Trash2, Edit2, ChevronDown, ChevronUp, Play, FileText,
} from "lucide-react";

export function ChatPostCard({ post, currentUser, onDelete, onEdit, onShowComments, commentsOpen, commentCount }: {
  post: any; currentUser: any; onDelete: (id: number) => void; onEdit: (id: number, text: string) => void;
  onShowComments: (postId: number) => void; commentsOpen: boolean; commentCount: number;
}) {
  const mine = post.mine || post.author?.id === currentUser?.id;
  const admin = post.role === "owner" || post.role === "admin";
  const canModerate = mine || admin;
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(post.text ?? "");

  return (
    <div className="mx-auto w-full max-w-[640px] px-3 py-2.5 border-b border-line dark:border-white/5 bg-paper dark:bg-[#131313]">
      <div className="flex gap-2.5">
        <Avatar src={post.author?.avatar_url} name={post.author?.display_name || post.author?.username || "?"} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-bold text-gray-800 dark:text-gray-100">
              {post.author?.display_name || post.author?.username}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-white/40">{timeAgo(post.created_at)}</span>
            {post.edited && <span className="text-[10px] text-gray-400 dark:text-white/30">· отредакт.</span>}
          </div>

          {post.text && <div className="mt-1 text-sm break-words whitespace-pre-wrap text-gray-800 dark:text-gray-200">{post.text}</div>}

          {post.media_url && (
            <div className="my-1.5 rounded-lg overflow-hidden max-h-[340px] flex items-center justify-center bg-gray-800/40">
              {post.media_type === "video" ? (
                <video src={mediaUrl(post.media_url)} controls className="max-w-full max-h-[340px]" />
              ) : post.media_type === "audio" ? (
                <audio src={mediaUrl(post.media_url)} controls />
              ) : (
                <img src={mediaUrl(post.media_url)} alt="" className="max-w-full max-h-[340px] object-contain" />
              )}
            </div>
          )}

          {post.link_url && (
            <a href={post.link_url} target="_blank" rel="noreferrer"
              className="mt-1.5 block text-sm text-[#3b82f6] break-all">
              {post.link_url}
            </a>
          )}

          <div className="mt-1.5 flex items-center gap-4 text-[11px] text-gray-500 dark:text-white/40">
            <button onClick={() => onShowComments(post.id)} className="flex items-center gap-1 hover:text-gray-300">
              <MessageCircle size={14} /> <span>{commentCount} комм.</span>
            </button>
            {canModerate && (
              <>
                <button onClick={() => { setEditOpen(true); setEditText(post.text ?? ""); }} className="hover:text-gray-300">
                  <Edit2 size={13} />
                </button>
                <button onClick={() => onDelete(post.id)} className="hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {editOpen && canModerate && (
        <div className="mt-2 ml-9">
          <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
            className="w-full text-sm bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-lg p-2"
            rows={2} />
          <div className="flex gap-2 mt-1">
            <button onClick={() => { onEdit(post.id, editText); setEditOpen(false); }} className="text-xs px-2 py-1 rounded bg-[#8b5cf6] text-white">Сохранить</button>
            <button onClick={() => setEditOpen(false)} className="text-xs">Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}
