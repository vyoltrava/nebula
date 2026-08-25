"use client";
import { useState, useEffect, useRef } from "react";
import { loadSessionKey } from "@/lib/secureSessionKeys";
import { decryptMediaBlob } from "@/lib/mediaCrypto";
import { VideoNotePlayer } from "./VideoNotePlayer";
import { AudioPlayer } from "./AudioPlayer";
import { VideoPlayer } from "./VideoPlayer";
import { Lock } from "lucide-react";

interface Props {
  mediaUrl: string;
  mediaType: string;
  chatId: number;
}

export function EncryptedMediaPlayer({ mediaUrl, mediaType, chatId }: Props) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function decrypt() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          if (!cancelled) setError("Нет токена");
          return;
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/media/${mediaUrl}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          if (!cancelled) setError("Не удалось загрузить");
          return;
        }

        const blob = await res.blob();

        const sk = loadSessionKey(chatId);
        if (!sk) {
          if (!cancelled) setError("Нет ключа сессии");
          return;
        }

        const decryptedBlob = await decryptMediaBlob(blob, sk);
        const url = URL.createObjectURL(decryptedBlob);
        
        if (!cancelled) {
          objectUrlRef.current = url;
          setDecryptedUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        if (!cancelled) setError("Ошибка расшифровки");
      }
    }
    
    decrypt();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
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
  if (mediaType === "video") return <VideoPlayer src={decryptedUrl} />;
  if (mediaType === "audio") return <AudioPlayer src={decryptedUrl} />;
  if (mediaType === "image" || mediaType === "gif") {
    return <img src={decryptedUrl} alt="" className="rounded-xl max-h-52 sm:max-h-64 w-full object-cover" />;
  }

  return null;
}