// components/MessageBubble.tsx
"use client";
import React, { memo } from 'react';
import dynamic from 'next/dynamic';
import { Avatar } from './Avatar';
// 🚀 react-markdown тяжёлый — ленивая загрузка
const MarkdownRenderer = dynamic(() => import('./MarkdownRenderer').then(m => m.MarkdownRenderer), {
  ssr: false,
  loading: () => <div className="editor-loading animate-pulse text-sm opacity-50">📝 …</div>,
});
import { VideoPlayer } from './VideoPlayer';
import { AudioPlayer } from './AudioPlayer';
import { VideoNotePlayer } from './VideoNotePlayer';
import { EncryptedMediaPlayer } from './EncryptedMediaPlayer';
import LinkPreview from './LinkPreview';
import { SwipeableMessage } from './SwipeableMessage';
import { Pin, Check, CheckCheck, SmilePlus, MoreVertical, Lock, Phone, PhoneOff, Video } from 'lucide-react';
import { formatChatTime } from '@/lib/time';
import { parseCallLog, CallLogPayload } from '@/lib/callLog';
import { mediaUrl } from '@/lib/media';

function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function CallLogRow({ log, time, isMine }: { log: CallLogPayload; time: string; isMine: boolean }) {
  const isVideo = log.call_type === 'video';
  const title = isVideo ? 'Видеозвонок' : 'Аудиозвонок';
  let sub: string;
  let Icon = isVideo ? Video : Phone;
  if (log.outcome === 'missed') {
    sub = 'Пропущенный';
    Icon = PhoneOff;
  } else if (log.outcome === 'declined') {
    sub = 'Отклонённый';
    Icon = PhoneOff;
  } else {
    sub = log.duration > 0 ? `Длительность: ${formatCallDuration(log.duration)}` : 'Не состоялся';
  }
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} my-1.5`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-gray-100 dark:bg-white/10 border border-line dark:border-white/15 max-w-[85%]">
        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${log.outcome === 'ended' ? 'bg-[#8b5cf6]/20' : 'bg-red-500/15'}`}>
          <Icon size={17} className={log.outcome === 'ended' ? 'text-[#8b5cf6]' : 'text-red-400'} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight text-gray-900 dark:text-white">{title}</p>
          <p className={`text-[11px] leading-tight ${log.outcome === 'ended' ? 'text-gray-500 dark:text-white/40' : 'text-red-400/90'}`}>{sub}</p>
        </div>
        <span className="self-end text-[10px] text-gray-400 dark:text-white/30 ml-2">{time}</span>
      </div>
    </div>
  );
}

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
  authorName?: string | null; // 📢 Подпись автора (для каналов)
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
  displayText, senderGlow, isPinned, authorName, onEditChange, onSubmitEdit, onCancelEdit,
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

  // 📞 Сообщение-уведомление о звонке (аудио/видео, пропущенный, отклонённый, длительность)
  const callLog = parseCallLog(displayText);
  if (callLog) {
    const time = formatChatTime(msg.created_at);
    return (
      <div
        id={`msg-${msg.id}`}
        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <CallLogRow log={callLog} time={time} isMine={isMine} />
      </div>
    );
  }

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
          <div className={`shrink-0 w-5 h-5 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center mt-2 transition-colors ${isSelected ? "bg-[#8b5cf6] border-[#8b5cf6]" : "border-line dark:border-white/30"}`}>
            {isSelected && <Check size={12} className="text-gray-900 dark:text-white" />}
          </div>
        )}

        {!isMine && !isSelectMode && !msg.isGrouped && isGroup && (
          <div className="shrink-0" style={senderGlow ? { filter: `drop-shadow(0 0 6px ${senderGlow})` } : undefined}>
            <Avatar src={msg.sender_avatar} name={msg.sender_name} id={msg.sender_id} size={32} />
          </div>
        )}

        <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] min-w-0 flex flex-col ${isMine ? "items-end" : "items-start"}`}>
          {isGroup && !isMine && (
            <div className="mb-1 px-1">
              <p className="text-[11px] sm:text-xs font-bold" style={senderGlow ? { color: senderGlow } : { color: "#a78bfa" }}>
                {msg.sender_name}
              </p>
              {/* 📢 подпись автора поста в канале — мелким серым */}
              {authorName && authorName !== msg.sender_name && (
                <p className="text-[10px] text-gray-500 dark:text-white/40 leading-tight">
                  {authorName}
                </p>
              )}
            </div>
          )}

          <div className={`${bubbleRadius} transition-all ${isSelected ? "ring-2 ring-[#8b5cf6] ring-offset-2 ring-offset-[#171717]" : ""} ${isVideoNote || isAudio || isSticker ? "p-0 bg-transparent border-0 rounded-2xl overflow-hidden" : `px-3 sm:px-3.5 md:px-4 py-2 sm:py-2 ${isForwarded ? 
            (isMine ? "bg-cyan-600 text-white border-l-4 border-cyan-600 dark:border-cyan-400" : "bg-cyan-950/40 text-white border-l-4 border-cyan-600 dark:border-cyan-400") : (isMine ? (isSecret ? "bg-emerald-600 text-white" : "bg-[#8b5cf6] text-white") : "bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white border border-line dark:border-white/15")}`}`}>            
            
            {/* Медиа контент */}
            {msg.is_temp && msg.is_uploading && !msg.media_url ? (
              /* 🆕 Плейсхолдер с анимацией загрузки (медиа ещё отправляется) */
              <div className="w-44 h-44 rounded-2xl bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 flex flex-col items-center justify-center gap-2.5">
                <span className="w-9 h-9 border-[3px] border-[#8b5cf6] border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] font-medium text-gray-500 dark:text-white/40">Загрузка…</span>
              </div>
            ) : msg.media_url && isEncryptedMedia ? (
              msg.media_url === "temp_encrypted_media" ? (
                <div className="w-56 h-56 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse flex items-center justify-center">
                  <Lock size={20} className="text-gray-500 dark:text-white/30" />
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
                  isMine ? "bg-gray-100 dark:bg-white/15 border-gray-300 dark:border-white/60 hover:bg-gray-100 dark:hover:bg-white/20" : "bg-gray-100 dark:bg-white/5 border-[#8b5cf6] hover:bg-gray-100 dark:hover:bg-white/10"
                }`}
              >
                <p className={`text-[11px] font-bold mb-0.5 ${isMine ? "text-gray-800 dark:text-white/90" : "text-[#8b5cf6]"}`}>
                  {msg.reply_preview.sender_name}
                </p>
                <p className={`text-[11px] truncate ${isMine ? "text-gray-800 dark:text-white/70" : "text-gray-600 dark:text-white/50"}`}>
                  {msg.reply_preview.text || "📎 Вложение"}
                </p>
              </button>
            )}

            {/* Текст и ссылки */}
            {displayText && (
              <>
                <MarkdownRenderer text={displayText} isMessage={true} />
                {!isSecret && extractFirstUrl(displayText) && (
                  <div className="w-full min-w-0">
                    <LinkPreview url={extractFirstUrl(displayText)!} />
                  </div>
                )}
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
                    : "bg-gray-100 dark:bg-white/5 border-line dark:border-white/15 hover:bg-gray-100 dark:hover:bg-white/10"
                  }`}
                >
                  {r.type === "sticker" ? (
                    /* ✅ ИСПРАВЛЕНО: убран невалидный JS-комментарий изнутри JSX */
                    <img src={mediaUrl(r.content)} alt="" className="w-5 h-5 object-contain" />
                  ) : (
                    <span>{r.emoji}</span>
                  )}
                  <span className={`text-[11px] font-bold ${r.me ? "text-[#a78bfa]" : "text-gray-600 dark:text-white/60"}`}>
                    {r.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Время и галочки */}
          {!isEditing && !isSelectMode && (
            <div className={`flex items-center gap-1.5 sm:gap-2 mt-1 px-1 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
              <p className={`text-[10px] sm:text-[11px] flex items-center gap-1 ${isMine ? "text-gray-600 dark:text-white/60" : "text-gray-500 dark:text-white/40"}`}>
                {isPinned && <Pin size={10} className="text-[#8b5cf6]" />}
                {formatChatTime(msg.created_at)}
                {isMine && (msg.read ? <CheckCheck size={12} className="text-sky-600 dark:text-sky-300" /> : <Check size={12} className="text-gray-600 dark:text-white/50" />)}
              </p>
              <button onClick={onReactionClick} className="p-1 text-gray-500 dark:text-white/40 hover:text-[#8b5cf6] active:scale-90 transition-transform" title="Реакция">
                <SmilePlus size={14} />
              </button>
              {!isSecret && (
                <button onClick={onMenuClick} data-post-menu-btn="true" className="p-1 text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white active:scale-90 transition-transform">
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