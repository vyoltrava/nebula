"use client";
import { useState, useRef } from "react";
import { X, Upload, Image as ImageIcon, Save } from "lucide-react";
import { getToken } from "@/lib/auth";
import { mediaUrl } from "@/lib/media";
import { Button, IconButton } from "@/components/ui/Button";

interface GroupSettingsModalProps {
  chatId: number;
  chat: any;
  onClose: () => void;
  onUpdate: () => void;
}

export function GroupSettingsModal({ chatId, chat, onClose, onUpdate }: GroupSettingsModalProps) {
  const [name, setName] = useState(chat.name || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(chat.avatar_url || null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    setLoading(true);
    const token = getToken();
    if (!token) return;

    try {
      // 1. Обновляем название
      if (name !== chat.name) {
        const form = new FormData();
        form.append("name", name);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) throw new Error("Failed to update name");
      }

      // 2. Если загружена новая аватарка
      if (avatarFile) {
        const form = new FormData();
        form.append("file", avatarFile);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (res.ok) {
          const data = await res.json();
          setAvatarPreview(data.avatar_url);
        } else {
          throw new Error("Failed to upload avatar");
        }
      }

      onUpdate();
      onClose();
    } catch (e) {
      console.error("Failed to update group", e);
      alert("Ошибка обновления группы");
    } finally {
      setLoading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-ivory dark:bg-[#1f1f23] rounded-2xl border border-line dark:border-white/10 shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-gray-900 dark:text-white">Настройки группы</h2>
          <IconButton icon={X} size="iconSm" onClick={onClose} />
        </div>

        {/* Аватарка */}
        <div className="flex flex-col items-center mb-4">
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 cursor-pointer group" onClick={() => fileRef.current?.click()}>
            {avatarPreview ? (
              <img src={mediaUrl(avatarPreview)} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 dark:text-white/40">
                <ImageIcon size={32} />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload size={20} className="text-gray-900 dark:text-white" />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <p className="text-[10px] text-gray-500 dark:text-white/40 mt-1">Нажмите на аватар, чтобы изменить</p>
        </div>

        {/* Название */}
        <div className="mb-4">
          <label className="text-xs text-gray-600 dark:text-white/60 font-bold block mb-1">Название группы</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="w-full px-3 py-2 rounded-lg border border-line dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/40 focus:outline-none focus:border-[#8b5cf6] text-sm"
            placeholder="Название группы"
          />
          <p className="text-[10px] text-gray-500 dark:text-white/30 mt-0.5 text-right">{name.length}/80</p>
        </div>

        {/* Кнопки */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          <Button
            icon={Save}
            loading={loading}
            onClick={handleSave}
            disabled={loading}
            className="flex-1"
          >
            {loading ? "Сохранение..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}