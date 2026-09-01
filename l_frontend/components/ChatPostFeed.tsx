"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Avatar } from "@/components/Avatar";
import { GroupMembersModal } from "@/components/GroupMembersModal";
import { GroupSettingsModal } from "@/components/GroupSettingsModal";
import { ChatPostCard } from "@/components/ChatPostCard";
import { CommentNode } from "@/components/ChatCommentNode";
import { useWebSocket } from "@/src/hooks/useWebSocket";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Send, ImageIcon, Users, Settings, X, Paperclip, Link as LinkIcon } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL;
const PAGE = 20;

export function ChatPostFeed({ chatId, initialChatInfo }: { chatId: string; initialChatInfo: any }) {
  const { t } = useI18n();
  const router = useRouter();
  const token = getToken();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [chatInfo, setChatInfo] = useState<any>(initialChatInfo || null);
  const [posts, setPosts] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState({ text: "", media_url: "", media_type: "", link: "" });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [commentsOpen, setCommentsOpen] = useState<number | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [cOffset, setCOffset] = useState(0);
  const [cHasMore, setCHasMore] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentParent, setCommentParent] = useState<number | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const authFetch = (url: string, opts: any = {}) =>
    fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

  const loadChatInfo = async () => { try { const r = await authFetch(`${API}/api/chats/${chatId}`); if (r.ok) setChatInfo(await r.json()); } catch {} };
  const loadPosts = async (reset = false) => {
    const off = reset ? 0 : offset;
    const res = await authFetch(`${API}/api/chats/${chatId}/posts?offset=${off}&limit=${PAGE}`);
    if (res.ok) { const data: any[] = await res.json(); setPosts((p) => reset ? data : [...p, ...data]); setOffset(off + data.length); setHasMore(data.length === PAGE); }
    if (reset) setLoading(false);
  };
  const uploadMedia = async () => {
    if (!mediaFile) return;
    const fd = new FormData(); fd.append("file", mediaFile);
    const res = await authFetch(`${API}/api/media/upload`, { method: "POST", body: fd });
    if (res.ok) { const d = await res.json(); setComposer((p) => ({ ...p, media_url: d.url, media_type: d.media_type })); setMediaFile(null); setShowMedia(false); }
  };
  const sendPost = async () => {
    if (!composer.text.trim() && !composer.media_url) return;
    if (mediaFile) await uploadMedia();
    const body = { text: composer.text.trim() || null, media_url: composer.media_url || null, media_type: composer.media_type || null, link_url: composer.link || null };
    const res = await authFetch(`${API}/api/chats/${chatId}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) setComposer({ text: "", media_url: "", media_type: "", link: "" });
  };
  const openComments = async (postId: number) => {
    setCommentsOpen(postId); setComments([]); setCOffset(0); setCommentText(""); setCommentParent(null);
    const res = await authFetch(`${API}/api/chats/posts/${postId}/comments?offset=0&limit=${PAGE}`);
    if (res.ok) { const d = await res.json(); setComments(d.comments); setCHasMore(d.has_more); setCOffset(d.limit); }
  };
  const loadMoreComments = async () => {
    const res = await authFetch(`${API}/api/chats/posts/${commentsOpen}/comments?offset=${cOffset}&limit=${PAGE}`);
    if (res.ok) { const d = await res.json(); setComments((p) => [...p, ...d.comments]); setCOffset(cOffset + d.comments.length); setCHasMore(d.has_more); }
  };
  const sendComment = async () => {
    if (!commentText.trim()) return;
    const res = await authFetch(`${API}/api/chats/posts/${commentsOpen}/comments`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: commentText.trim(), parent_id: commentParent || undefined }) });
    if (res.ok) { const d = await res.json(); const node = { ...d, author: currentUser, children: [], mine: true };
      setComments((prev) => { const last = prev[prev.length - 1]; if (commentParent && last && last.children) { last.children.push(node); return [...prev]; } return [...prev, node]; });
      setCommentText(""); setCommentParent(null); }
  };
  const deletePost = async (id: number) => { await authFetch(`${API}/api/chats/posts/${id}`, { method: "DELETE" }); };
  const editPost = async (id: number, text: string) => { await authFetch(`${API}/api/chats/posts/${id}`, { method: "PATCH", body: new URLSearchParams({ text }) }); };
  const deleteComment = async (id: number) => { await authFetch(`${API}/api/chats/comments/${id}`, { method: "DELETE" }); };
  const copyLink = (link: string) => { try { navigator.clipboard?.writeText(`${location.origin}${link}`); } catch {} alert("Ссылка скопирована"); };
  const makeInvite = async () => {
    const res = await authFetch(`${API}/api/chats/${chatId}/invite`, { method: "POST" });
    if (res.ok) { const d = await res.json(); setInviteLink(d.invite_link); copyLink(d.invite_link); } else { alert("Нет прав на создание приглашения"); }
  };
  const isModerator = chatInfo?.my_role === "owner" || chatInfo?.my_role === "admin";

  // WS realtime
  useWebSocket("new_chat_post", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setPosts((prev) => [{ ...data, author: currentUser?.id === data.author_id ? currentUser : data.author, comment_count: 0, mine: data.author_id === currentUser?.id }, ...prev]);
  });
  useWebSocket("chat_post_edited", (data: any) => setPosts((prev) => prev.map((p) => p.id === data.id ? { ...p, text: data.text, edited: true, edited_at: data.edited_at } : p)));
  useWebSocket("chat_post_deleted", (data: any) => setPosts((prev) => prev.filter((p) => p.id !== data.id)));
  useWebSocket("new_chat_comment", (data: any) => {
    if (String(data.chat_id) !== String(chatId) || !commentsOpen || commentsOpen !== data.post_id) return;
    const node = { ...data, author: currentUser?.id === data.author_id ? currentUser : data.author, children: [], mine: data.author_id === currentUser?.id };
    setComments((prev) => { const last = prev[prev.length - 1]; if (last && last.children) { last.children.push(node); return [...prev]; } return [...prev, node]; });
  });
  useWebSocket("chat_comment_deleted", (data: any) => {
    if (!commentsOpen || data.post_id !== commentsOpen) return;
    const rm = (arr: any[]): any[] => arr.filter((c) => { if (c.id === data.id) return false; c.children = rm(c.children || []); return true; });
    setComments((prev) => rm(prev));
  });
  useWebSocket("chat_settings_updated", (data: any) => {
    if (String(data.chat_id) !== String(chatId)) return;
    setChatInfo((prev: any) => ({ ...prev, name: data.name ?? prev?.name, avatar_url: data.avatar_url ?? prev?.avatar_url, who_can_post: data.who_can_post ?? prev?.who_can_post, who_can_comment: data.who_can_comment ?? prev?.who_can_comment }));
  });
  useWebSocket("group_member_added", (data: any) => { if (String(data.chat_id) === String(chatId)) loadChatInfo(); });
  useWebSocket("group_member_removed", (data: any) => { if (String(data.chat_id) === String(chatId)) loadChatInfo(); });

  useEffect(() => {
    authFetch(`${API}/api/me`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCurrentUser(d)).catch(() => {});
    loadPosts(true);
  }, []);
  useEffect(() => { loadChatInfo(); }, []);

  return (
    <>
    <div className="h-screen flex overflow-hidden bg-paper dark:bg-[#111]">
      <Sidebar />
      <div className="w-px shrink-0 bg-gray-200 dark:bg-white/10 my-3 hidden md:block" />
      <main className="flex-1 flex flex-col border-l border-line dark:border-white/10 overflow-hidden">
        {/* Header */}
        <div className="border-b border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 backdrop-blur-md px-3 py-2.5 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => { if (window.history.length > 1) router.back(); else router.push("/messages"); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
          {chatInfo?.avatar_url ? (
            <Avatar src={chatInfo.avatar_url} name={chatInfo.name || "Группа"} size={36} />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gray-200 dark:bg-white/5 flex items-center justify-center shrink-0">
              <Users size={20} className="text-gray-500 dark:text-white/40" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-800 dark:text-white truncate">{chatInfo?.name || t("messages.group")}</div>
            <div className="text-[10px] text-gray-500 dark:text-white/40">{chatInfo?.members_count} {t("messages.members2")} · {chatInfo?.who_can_post === "admins" ? t("messages.adminsOnlyPost") : t("messages.allMembersPost")}</div>
          </div>
          {isModerator && (
            <button onClick={makeInvite} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10" title={t("messages.createGroup")}>
              <LinkIcon size={18} />
            </button>
          )}
          {isModerator && (
            <button onClick={() => setShowSettings(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10" title={t("messages.groupSettings")}>
              <Settings size={18} />
            </button>
          )}
        </div>

        {inviteLink && (
          <div className="px-3 py-2 border-b border-line dark:border-white/10 bg-gray-100/50 dark:bg-white/5 flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-gray-600 dark:text-gray-300">{inviteLink}</span>
            <button onClick={() => { setInviteLink(null); }} className="text-gray-500 hover:text-gray-300">×</button>
          </div>
        )}
        {/* Posts list */}
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="p-4 text-center text-sm text-gray-500">{t("common.loading")}</div>}
          {posts.map((p) => (
            <ChatPostCard
              key={p.id}
              post={p}
              currentUser={currentUser}
              commentCount={p.comment_count}
              commentsOpen={commentsOpen === p.id}
              onShowComments={openComments}
              onDelete={(id) => { deletePost(id); }}
              onEdit={(id, text) => editPost(id, text)}
            />
          ))}
          {!loading && posts.length === 0 && <div className="p-6 text-center text-sm text-gray-500">{t("common.noPosts")}</div>}
          {hasMore && posts.length > 0 && (
            <button onClick={() => loadPosts(false)} className="w-full py-3 text-center text-xs text-gray-500 hover:text-gray-300">
              {t("common.loadMore")}
            </button>
          )}
        </div>
        {/* Composer */}
        <div className="border-t border-line dark:border-white/10 bg-paper dark:bg-[#171717]/95 p-2">
          {composer.media_url && (
            <div className="mb-2 rounded-lg overflow-hidden max-h-40 relative">
              {composer.media_type === "video" ? <video src={mediaUrl(composer.media_url)} controls className="max-w-full" />
                : <img src={mediaUrl(composer.media_url)} alt="" className="max-w-full max-h-40 object-contain" />}
              <button onClick={() => setComposer((p) => ({ ...p, media_url: "", media_type: "" }))} className="absolute top-1 right-1 p-0.5 bg-black/40 rounded">
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea value={composer.text} onChange={(e) => setComposer((p) => ({ ...p, text: e.target.value }))}
              placeholder={t("messages.writePost")} rows={composer.text.length > 80 ? 3 : 1}
              className="flex-1 text-sm bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-lg p-2 resize-none" />
            <label className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer">
              <ImageIcon size={18} />
              <input type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => setMediaFile(e.target.files?.[0] || null)} />
            </label>
            <button onClick={() => setComposer((p) => ({ ...p, link: "" }))} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
              <Paperclip size={18} />
            </button>
            <button onClick={sendPost} disabled={!composer.text.trim() && !composer.media_url}
              className="p-1.5 rounded bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white">
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>

    {/* Comments modal / drawer */}
    {commentsOpen && (
      <div className="fixed inset-0 z-[100] bg-black/40 flex items-end sm:items-center" onClick={() => setCommentsOpen(null)}>
        <div className="bg-paper dark:bg-[#171717] w-full sm:max-w-[480px] sm:rounded-t-2xl sm:mb-10 h-full sm:h-[520px] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="p-3 border-b border-line dark:border-white/10 flex items-center justify-between">
            <span className="font-medium text-sm">{t("messages.commentsTitle")}</span>
            <button onClick={() => setCommentsOpen(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10"><X size={16} /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {comments.map((c) => <CommentNode key={c.id} c={c} currentUser={currentUser} onDelete={deleteComment} onReply={(id) => setCommentParent(id)} />)}
            {cHasMore && <button onClick={loadMoreComments} className="text-xs text-gray-500">{t("common.loadMore")}</button>}
          </div>
          <div className="p-2 border-t border-line dark:border-white/10 flex items-end gap-2">
            {commentParent && (
              <div className="text-[10px] text-gray-500">Ответ на комментарий #{commentParent} · <button onClick={() => setCommentParent(null)}>×</button></div>
            )}
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("messages.commentPlaceholder")} rows={1}
              className="flex-1 text-sm bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 rounded-lg p-2 resize-none"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }} />
            <button onClick={sendComment} disabled={!commentText.trim()} className="p-1.5 rounded bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    )}

        {showMembers && chatInfo && (
      <GroupMembersModal chatId={Number(chatId)} myRole={chatInfo.my_role} onClose={() => setShowMembers(false)} onChanged={loadChatInfo} />
    )}
    {showSettings && chatInfo && (
      <GroupSettingsModal chatId={Number(chatId)} chat={chatInfo} onClose={() => setShowSettings(false)} onUpdate={loadChatInfo} />
    )}
    </>
  );
}
