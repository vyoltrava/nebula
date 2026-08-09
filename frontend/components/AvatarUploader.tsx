"use client";
import { useState, useRef } from "react";
import { AvatarCropper } from "./AvatarCropper";
import { getToken } from "@/lib/auth";

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

    const reader = new FileReader();
    reader.onload = () => {
      setCropperImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Сбрасываем input, чтобы можно было выбрать тот же файл снова
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const token = getToken();
    if (!token) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", croppedBlob, "avatar.jpg");

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

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
    const reader = new FileReader();
    reader.onload = () => setCropperImage(reader.result as string);
    reader.readAsDataURL(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const token = getToken();
    if (!token) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", croppedBlob, "avatar.jpg");
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