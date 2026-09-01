"use client";
import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { getToken } from "@/lib/auth";

// 🚀 react-easy-crop — тяжёлая библиотека: грузим только при открытии кроппера
const AvatarCropper = dynamic(() => import("./AvatarCropper").then(m => m.AvatarCropper), {
  ssr: false,
  loading: () => <div className="cropper-placeholder p-6 text-center text-sm opacity-60">✂️ Загрузка редактора…</div>,
});

interface AvatarUploaderProps {
  currentAvatar?: string | null;
  onUploaded: (newUrl: string) => void;
  endpoint?: string; // "/api/me/avatar" или "/api/admin/users/{id}/avatar/set"
}

export function AvatarUploader({ 
  currentAvatar, 
  onUploaded, 
  endpoint = "/api/me/avatar" 
}: AvatarUploaderProps) {
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 🎞 GIF: кроппер (canvas) убивает анимацию — грузим оригинал как есть
    if (file.type === "image/gif") {
      handleUpload(file, "avatar.gif");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropperImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Сбрасываем input, чтобы можно было выбрать тот же файл снова
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async (blob: Blob, filename: string) => {
    const token = getToken();
    if (!token) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", blob, filename);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (res.ok) {
        const data = await res.json();
        onUploaded(data.avatar_url || data.url);
        setCropperImage(null);
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка загрузки");
      }
    } catch (err) {
      alert("Ошибка при загрузке");
    } finally {
      setUploading(false);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    await handleUpload(croppedBlob, "avatar.jpg");
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
      
      {cropperImage && (
        <AvatarCropper
          imageSrc={cropperImage}
          onCropComplete={handleCropComplete}
          onClose={() => setCropperImage(null)}
        />
      )}
    </>
  );
}

// Хук для использования
export function useAvatarUploader(onUploaded: (url: string) => void, endpoint?: string) {
  const [cropperImage, setCropperImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = () => inputRef.current?.click();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 🎞 GIF: кроппер (canvas) убивает анимацию — грузим оригинал как есть
    if (file.type === "image/gif") {
      handleUpload(file, "avatar.gif");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropperImage(reader.result as string);
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async (blob: Blob, filename: string) => {
    const token = getToken();
    if (!token) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${endpoint || "/api/me/avatar"}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = await res.json();
        onUploaded(data.avatar_url || data.url);
        setCropperImage(null);
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.detail || "Ошибка загрузки");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    await handleUpload(croppedBlob, "avatar.jpg");
  };

  return {
    cropperImage,
    uploading,
    inputRef,
    openFilePicker,
    handleFileSelect,
    handleCropComplete,
    setCropperImage,
  };
}