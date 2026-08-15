"use client";
import { useState, useEffect, useCallback } from "react";
import { getToken } from "@/lib/auth";
import { safeFetch } from "@/lib/ban";
import { Avatar } from "@/components/Avatar";
import { timeAgo } from "@/lib/time";
import { ChevronDown, ChevronRight, Reply, Trash2, Volume2 } from "lucide-react";
import Link from "next/link";

interface EchoNode {
  id: number;
  author_id: number;
  author: string;
  handle: string;
  username: string;
  author_avatar: string | null;
  author_is_admin: boolean;
  author_is_moderator: boolean;
  author_is_banned: boolean;
  author_role: { name: string; color: string } | null;
  text: string;
  media_url: string | null;
  media_type: string | null;
  echo_parent_id: number | null;
  likes_count: number;
  liked_by_me: boolean;
  echoes_count: number;
  created_at: string;
}

interface EchoTreeData {
  root_id: number;
  echoes: EchoNode[];
  total_count: number;
}

// Рекурсивный компонент узла дерева
function EchoBranch({
  node,
  children,
  depth,
  onReply,
}: {
  node: EchoNode;
  children: Map<number, EchoNode[]>;
  depth: number;
  onReply: (echoId: number, authorName: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const childNodes = children.get(node.id) || [];
  const hasChildren = childNodes.length > 0;

  return (
    <div className="relative">
      {/* Вертикальная линия-соединитель */}
      {depth > 0 && (
        <div
          className="absolute left-[-16px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#8b5cf6]/40 to-transparent"
          aria-hidden
        />
      )}

      <div className={`relative ${depth > 0 ? "ml-4 pl-4" : ""}`}>
        {/* Горизонтальная линия-соединитель */}
        {depth > 0 && (
          <div
            className="absolute left-[-16px] top-[20px] w-[16px] h-[2px] bg-[#8b5cf6]/30"
            aria-hidden
          />
        )}

        {/* Карточка эхо */}
        <div className="group relative bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 hover:border-[#8b5cf6]/20 transition-all duration-200">
          {/* Заголовок */}
          <div className="flex items-center gap-2 mb-1.5">
            <Link href={`/${node.username}`} onClick={(e) => e.stopPropagation()}>
              <Avatar src={node.author_avatar} name={node.author} id={node.author_id} size={24} />
            </Link>
            <Link
              href={`/${node.username}`}
              className="text-sm font-semibold text-white hover:text-[#8b5cf6] transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {node.author}
            </Link>
            <span className="text-xs text-white/40">{timeAgo(node.created_at)}</span>
            {node.author_role && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{
                  color: node.author_role.color,
                  backgroundColor: `${node.author_role.color}20`,
                }}
              >
                {node.author_role.name}
              </span>
            )}
          </div>

          {/* Текст эхо */}
          <p className="text-sm text-white/85 whitespace-pre-wrap break-words leading-relaxed">
            {node.text}
          </p>

          {/* Действия */}
          <div className="flex items-center gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onReply(node.id, node.author)}
              className="flex items-center gap-1 text-xs text-white/40 hover:text-[#8b5cf6] transition-colors"
            >
              <Reply size={12} />
              Эхо
            </button>
            {node.likes_count > 0 && (
              <span className="text-xs text-white/30">♥ {node.likes_count}</span>
            )}
          </div>
        </div>

        {/* Кнопка раскрытия/сворачивания */}
        {hasChildren && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-1 ml-2 text-xs text-[#8b5cf6]/70 hover:text-[#8b5cf6] transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Свернуть" : `${childNodes.length} эхо`}
          </button>
        )}

        {/* Рекурсивные дети */}
        {expanded && hasChildren && (
          <div className="mt-2 space-y-2">
            {childNodes.map((child) => (
              <EchoBranch
                key={child.id}
                node={child}
                children={children}
                depth={depth + 1}
                onReply={onReply}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Основной компонент дерева
export function EchoTree({ postId }: { postId: number }) {
  const [treeData, setTreeData] = useState<EchoTreeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expanded, setExpanded] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await safeFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/posts/${postId}/echoes`
      );
      if (res.ok) {
        const data = await res.json();
        setTreeData(data);
      }
    } catch (e) {
      console.error("Failed to load echo tree:", e);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (expanded) {
      loadTree();
    }
  }, [expanded, loadTree]);

  const handleReply = (echoId: number, authorName: string) => {
    setReplyingTo(echoId);
    setReplyText(`@${authorName} `);
  };

  const submitEcho = async (parentId: number) => {
    const token = getToken();
    if (!token || !replyText.trim()) return;

    const form = new FormData();
    form.append("text", replyText);

    const res = await safeFetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/posts/${parentId}/echo`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }
    );

    if (res.ok) {
      setReplyText("");
      setReplyingTo(null);
      loadTree(); // Перезагружаем дерево
    }
  };

  if (!treeData && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-[#8b5cf6] hover:border-[#8b5cf6]/30 transition-all text-sm"
      >
        <Volume2 size={14} />
        Показать эхо
      </button>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-white/40 text-sm">
        <Volume2 size={14} className="animate-pulse" />
        Загрузка эхо...
      </div>
    );
  }

  if (!treeData || treeData.echoes.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 text-white/30 text-sm">
        <Volume2 size={14} />
        Пока нет эхо
      </div>
    );
  }

  // Строим дерево: Map<parent_id, children[]>
  const childrenMap = new Map<number, EchoNode[]>();
  for (const echo of treeData.echoes) {
    if (echo.echo_parent_id !== null) {
      if (!childrenMap.has(echo.echo_parent_id)) {
        childrenMap.set(echo.echo_parent_id, []);
      }
      childrenMap.get(echo.echo_parent_id)!.push(echo);
    }
  }

  // Корневые эхо (те, чей родитель — сам пост)
  const rootEchoes = childrenMap.get(postId) || [];

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-2 text-sm text-[#8b5cf6] font-medium"
        >
          <Volume2 size={14} />
          Эхо ({treeData.total_count})
        </button>
      </div>

      {/* Дерево эхо */}
      <div className="space-y-2 border-l-2 border-[#8b5cf6]/20 pl-2">
        {rootEchoes.map((echo) => (
          <EchoBranch
            key={echo.id}
            node={echo}
            children={childrenMap}
            depth={0}
            onReply={handleReply}
          />
        ))}
      </div>

      {/* Форма ответа на корневой пост */}
      {replyingTo === postId && (
        <div className="mt-2 flex gap-2">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitEcho(postId);
              }
            }}
            placeholder="Добавить эхо..."
            className="flex-1 border border-white/15 rounded-lg px-3 py-2 bg-white/5 text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] transition-all"
            autoFocus
          />
          <button
            onClick={() => submitEcho(postId)}
            disabled={!replyText.trim()}
            className="px-3 py-2 rounded-lg bg-[#8b5cf6] text-white disabled:opacity-40 transition-all"
          >
            <Reply size={14} />
          </button>
          <button
            onClick={() => { setReplyingTo(null); setReplyText(""); }}
            className="px-3 py-2 rounded-lg border border-white/20 text-white/60 hover:bg-white/10 transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* Кнопка "Добавить эхо" если не отвечаем */}
      {replyingTo === null && (
        <button
          onClick={() => handleReply(postId, "")}
          className="mt-2 flex items-center gap-1 text-xs text-white/40 hover:text-[#8b5cf6] transition-colors"
        >
          <Reply size={12} />
          Добавить эхо
        </button>
      )}
    </div>
  );
}