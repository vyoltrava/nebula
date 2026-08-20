// components/MessageBubble.tsx
"use client";
import React, { memo } from 'react';
import { Avatar } from './Avatar';
import { MarkdownRenderer } from './MarkdownRenderer';
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { VideoNotePlayer } from './VideoNotePlayer';
import { EncryptedMediaPlayer } from './EncryptedMediaPlayer';
import LinkPreview from './LinkPreview';
import { SwipeableMessage } from './SwipeableMessage';
import { Pin, Check, CheckCheck, SmilePlus, MoreVertical, Lock } from 'lucide-react';
import { formatChatTime } from '@/lib/time';
import { mediaUrl } from '@/lib/media';

interface MessageBubbleProps {
  msg: any;
  isMine: boolean;
  isGroup: boolean;
  isSecret: boolean;
  isSelectMode: boolean;
  isSelected: boolean;
  isEditing: boolean;
  editText: string;
  displayText: string;
  senderGlow: string | null;
  isPinned: boolean;
  onEditChange: (text: string) => void;
  onSubmitEdit: () => void;
  onCancelEdit: () => void;
  onSelect: () => void;
  onReply: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onReactionClick: () => void;
  onMenuClick: (e: React.MouseEvent) => void;
  onToggleReaction: (msgId: number, stickerId?: number, emoji?: string) => void;
  activeMessageMenu: boolean;
  menuOpenUp: boolean;
  onSwipeRight: () => void;
  chatId: string | number;
  getMediaClasses: (type: string) => string;
  extractFirstUrl: (text: string) => string | null;
}

export const MessageBubble = memo(function MessageBubble({
  msg, isMine, isGroup, isSecret, isSelectMode, isSelected, isEditing, editText,
  displayText, senderGlow, isPinned, onEditChange, onSubmitEdit, onCancelEdit,
  onSelect, onReply, onContextMenu, onPointerDown, onPointerUp, onPointerLeave,
  onDoubleClick, onReactionClick, onMenuClick, onToggleReaction, activeMessageMenu, menuOpenUp, 
  onSwipeRight, chatId, getMediaClasses, extractFirstUrl
}: MessageBubbleProps) {

  const bubbleRadius = isMine
    ? "rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-[4px]"
    : "rounded-tl-2xl rounded-tr-2xl rounded-br-2xl rounded-bl-[4px]";

  const isVideoNote = !!msg.media_url && msg.media_type === "video_note";
  const isAudio = !!msg.media_url && msg.media_type === "audio";
  const isSticker = !!msg.media_url && msg.media_type === "sticker"; // 🆕 Добавлено для стикеров
  const isForwarded = !!msg.forwarded_from_id; // ✅ ИСПРАВЛЕНО: добавлена отсутствующая переменная
  const isEncryptedMedia = !!msg.is_encrypted_media || msg.ciphertext === "[encrypted_media]";

  return (
    <SwipeableMessage msgId={msg.id} onSwipeRight={onSwipeRight} raised={activeMessageMenu}>
      <div
        id={`msg-${msg.id}`}
        className={`flex gap-2 sm:gap-2 ${isMine ? "justify-end" : "justify-start"} ${isSelectMode ? "cursor-pointer select-none" : ""}`}
        onClick={() => { if (isSelectMode) onSelect(); }}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {isSelectMode && (
          <div className={`shrink-0 w-5 h-5 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center mt-2 transition-colors ${isSelected ? "bg-[#8b5cf6] border-[#8b5cf6]" : "border-white/30"}`}>
            {isSelected && <Check size={12} className="text-white" />}
          </div>
        )}

        {!isMine && !isSelectMode && !msg.isGrouped && isGroup && (
          <div className="shrink-0" style={senderGlow ? { filter: `drop-shadow(0 0 6px ${senderGlow})` } : undefined}>
            <Avatar src={msg.sender_avatar} name={msg.sender_name} id={msg.sender_id} size={32} />
          </div>
        )}

        <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] flex flex-col ${isMine ? "items-end" : "items-start"}`}>
          {isGroup && !isMine && (
            <p className="text-[11px] sm:text-xs font-bold mb-1 px-1" style={senderGlow ? { color: senderGlow } : { color: "#a78bfa" }}>
              {msg.sender_name}
            </p>
          )}

          <div className={`${bubbleRadius} transition-all ${isSelected ? "ring-2 ring-[#8b5cf6] ring-offset-2 ring-offset-[#171717]" : ""} ${isVideoNote || isAudio || isSticker ? "p-0 bg-transparent border-0 rounded-2xl overflow-hidden" : `px-3 sm:px-3.5 md:px-4 py-2 sm:py-2 ${isForwarded ? 
            (isMine ? "bg-cyan-600 text-white border-l-4 border-cyan-400" : "bg-cyan-950/40 text-white border-l-4 border-cyan-400") : (isMine ? (isSecret ? "bg-emerald-600 text-white" : "bg-[#8b5cf6] text-white") : "bg-white/10 text-white border border-white/15")}`}`}>            
            
            {/* Медиа контент */}
            {msg.media_url && isEncryptedMedia ? (
              msg.media_url === "temp_encrypted_media" ? (
                <div className="w-56 h-56 rounded-2xl bg-white/5 animate-pulse flex items-center justify-center">
                  <Lock size={20} className="text-white/30" />
                </div>
              ) : (
                <EncryptedMediaPlayer mediaUrl={msg.media_url} mediaType={msg.media_type} chatId={Number(chatId)} />
              )
            ) : (
              <>
                {msg.media_url && (msg.media_type === "image" || msg.media_type === "gif") && (
                  <img src={mediaUrl(msg.media_url)} alt="" className={getMediaClasses(msg.media_type)} />
                )}
                {msg.media_url && msg.media_type === "video" && <VideoPlayer src={msg.media_url} className={getMediaClasses("video")} />}
                {msg.media_url && msg.media_type === "audio" && <AudioPlayer src={mediaUrl(msg.media_url)} trackId={msg.id} title={`${msg.sender_name} · ${formatChatTime(msg.created_at)}`} />}
                {msg.media_url && msg.media_type === "video_note" && <VideoNotePlayer src={mediaUrl(msg.media_url)} trackId={msg.id} title={`${msg.sender_name} · ${formatChatTime(msg.created_at)}`} />}

                {/* 🆕 Рендер стикеров как сообщений */}
                {isSticker && (
                  <img 
                    src={mediaUrl(msg.media_url)} 
                    alt="sticker" 
                    className="w-32 h-32 sm:w-40 sm:h-40 object-contain" 
                  />
                )}
              </>
            )}

            {/* 🆕 ЦИТАТА (ответ на сообщение) */}
            {msg.reply_preview && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const el = document.getElementById(`msg-${msg.reply_preview.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('msg-soft-glow');
                    setTimeout(() => {
                        el.classList.remove('msg-soft-glow');
                    }, 3500);
                  }
                }}
                className={`w-full text-left mb-2 p-2 rounded-lg border-l-2 transition-colors cursor-pointer ${
                  isMine ? "bg-white/15 border-white/60 hover:bg-white/20" : "bg-white/5 border-[#8b5cf6] hover:bg-white/10"
                }`}
              >
                <p className={`text-[11px] font-bold mb-0.5 ${isMine ? "text-white/90" : "text-[#8b5cf6]"}`}>
                  {msg.reply_preview.sender_name}
                </p>
                <p className={`text-[11px] truncate ${isMine ? "text-white/70" : "text-white/50"}`}>
                  {msg.reply_preview.text || "📎 Вложение"}
                </p>
              </button>
            )}

            {/* Текст и ссылки */}
            {displayText && (
              <>
                <MarkdownRenderer text={displayText} isMessage={true} />
                {!isSecret && extractFirstUrl(displayText) && <LinkPreview url={extractFirstUrl(displayText)!} />}
              </>
            )}
          </div>

          {/* 🆕 РЕАКЦИИ */}
          {!isEditing && !isSelectMode && msg.reactions?.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
              {msg.reactions.map((r: any) => (
                <button
                  key={r.type === "sticker" ? `s_${r.sticker_id}` : `e_${r.emoji}`}
                  onClick={() => onToggleReaction(msg.id, r.sticker_id, r.emoji)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[13px] border transition-all active:scale-90 ${
                    r.me
                    ? "bg-[#8b5cf6]/25 border-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    : "bg-white/5 border-white/15 hover:bg-white/10"
                  }`}
                >
                  {r.type === "sticker" ? (
                    /* ✅ ИСПРАВЛЕНО: убран невалидный JS-комментарий изнутри JSX */
                    <img src={mediaUrl(r.content)} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <span>{r.emoji}</span>
                  )}
                  <span className={`text-[11px] font-bold ${r.me ? "text-[#a78bfa]" : "text-white/60"}`}>
                    {r.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Время и галочки */}
          {!isEditing && !isSelectMode && (
            <div className={`flex items-center gap-1.5 sm:gap-2 mt-1 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
              <p className={`text-[10px] sm:text-[11px] flex items-center gap-1 ${isMine ? "text-white/60" : "text-white/40"}`}>
                {isPinned && <Pin size={10} className="text-[#8b5cf6]" />}
                {formatChatTime(msg.created_at)}
                {isMine && (msg.read ? <CheckCheck size={12} className="text-sky-300" /> : <Check size={12} className="text-white/50" />)}
              </p>
              <button onClick={onReactionClick} className="p-1 text-white/40 hover:text-[#8b5cf6] active:scale-90 transition-transform" title="Реакция">
                <SmilePlus size={14} />
              </button>
              {!isSecret && (
                <button onClick={onMenuClick} className="p-1 text-white/40 hover:text-white active:scale-90 transition-transform">
                  <MoreVertical size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </SwipeableMessage>
  );
});