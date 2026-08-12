// components/EncryptedMediaPlayer.tsx
"use client";
import { useState, useEffect } from "react";
import { loadSessionKey } from "@/lib/crypto";
import { decryptMediaBlob } from "@/lib/mediaCrypto";
import { VideoNotePlayer } from "./VideoNotePlayer";
import { AudioPlayer } from "./AudioPlayer";
import { Lock } from "lucide-react";

interface Props {
  mediaUrl: string;
  mediaType: string;
  chatId: number;
}

export function EncryptedMediaPlayer({ mediaUrl, mediaType, chatId }: Props) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function decrypt() {
      try {
        const token = localStorage.getItem("token");
        if (!token) { setError("Нет токена"); return; }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/media/${mediaUrl}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) { setError("Не удалось загрузить"); return; }

        const blob = await res.blob();

        const sk = loadSessionKey(chatId);
        if (!sk) {
        setError("Нет ключа сессии");
        return;
        }


        const decryptedBlob = await decryptMediaBlob(blob, sk);
        setDecryptedUrl(URL.createObjectURL(decryptedBlob));
      } catch (e) {
        setError("Ошибка расшифровки");
      }
    }
    decrypt();

    return () => {
      if (decryptedUrl) URL.revokeObjectURL(decryptedUrl);
    };
  }, [mediaUrl, chatId]);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 text-xs py-2">
        <Lock size={12} /> {error}
      </div>
    );
  }

  if (!decryptedUrl) {
    return (
      <div className="w-56 h-56 rounded-2xl bg-white/5 animate-pulse flex items-center justify-center">
        <Lock size={20} className="text-white/30" />
      </div>
    );
  }

  if (mediaType === "video_note") return <VideoNotePlayer src={decryptedUrl} />;
  if (mediaType === "audio") return <AudioPlayer src={decryptedUrl} />;
  if (mediaType === "image") return <img src={decryptedUrl} alt="" className="rounded-xl max-h-52 sm:max-h-64 w-full object-cover" />;

  return null;
}