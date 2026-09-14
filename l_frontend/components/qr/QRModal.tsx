'use client';
import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import PrettyQR from './PrettyQR';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  value: string;
  /** Аватарка пользователя — рисуется в центре QR скруглённым квадратом. */
  avatarUrl?: string | null;
  footer?: React.ReactNode;
  qrSize?: number;
}

/** Модалка для показа «красивого» QR с кнопкой «Копировать». */
export default function QRModal({ open, onClose, title, subtitle, value, avatarUrl, footer, qrSize = 210 }: Props) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#1E1E23] rounded-2xl p-6 max-w-sm w-full text-center max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-[#B9B8BD] hover:text-gray-900 dark:hover:text-white p-1" aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>
        {subtitle && <p className="text-sm text-[#B9B8BD] mb-4 break-words">{subtitle}</p>}
        <div className="flex justify-center mb-4">
          <PrettyQR value={value} size={qrSize} avatarUrl={avatarUrl} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={copy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-white/80 text-sm font-medium py-2.5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
          >
            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
            {copied ? 'Скопировано' : 'Копировать'}
          </button>
          {footer}
        </div>
      </div>
    </div>
  );
}
