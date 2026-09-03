// components/AppIconPicker.tsx — выбор иконки приложения (как в Telegram).
// Доступно с 2 уровня (ICON_MIN_LEVEL).
'use client';

import { useState } from 'react';
import { Check, Lock, Smartphone } from 'lucide-react';
import { APP_ICONS, ICON_MIN_LEVEL, DEFAULT_ICON, getIconId, setAppIcon } from '@/lib/pwaIcons';
import { getCachedUser } from '@/lib/authCache';
import { getUserLevel } from '@/lib/auth';

/** Превью иконки: стандартная — из корня, варианты — из своих папок. */
function previewSrc(id: string): string {
  return id === DEFAULT_ICON ? '/pwa/icon-192.png' : `/pwa/icons/${id}/icon-192.png`;
}

export function AppIconPicker() {
  const [current, setCurrent] = useState<string>(() => getIconId());
  const [note, setNote] = useState<string | null>(null);
  const level = getUserLevel(getCachedUser());
  const locked = level < ICON_MIN_LEVEL;

  const pick = (id: string) => {
    if (locked) return;
    setAppIcon(id);
    setCurrent(id);
    try {
      const cap = (window as any).Capacitor;
      const isNative = !!cap?.isNativePlatform?.();
      setNote(
        isNative
          ? 'Иконка обновлена — приложение сейчас перезапустится.'
          : 'Иконка вкладки обновлена. Иконка установленного PWA обновится, когда система перепроверит манифест.'
      );
    } catch {
      setNote(null);
    }
  };

  return (
    <div className={`relative rounded-2xl border border-line dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 sm:p-5 ${locked ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={18} className="text-[#8b5cf6]" />
        <h3 className="font-bold text-gray-900 dark:text-white">Иконка приложения</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/40 mb-4">
        Выбери иконку приложения на экране устройства.
      </p>

      {locked && (
        <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center gap-2 bg-white/70 dark:bg-black/70 backdrop-blur-[2px]">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-white/10 flex items-center justify-center">
            <Lock size={18} className="text-gray-500 dark:text-white/50" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Доступно с {ICON_MIN_LEVEL} уровня
          </p>
          <p className="text-xs text-gray-500 dark:text-white/40">
            Твой уровень: {level}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
        {APP_ICONS.map((icon) => (
          <button
            key={icon.id}
            onClick={() => pick(icon.id)}
            title={icon.name}
            className={`relative rounded-2xl p-1 transition-all active:scale-95 ${
              current === icon.id
                ? 'ring-2 ring-[#8b5cf6] ring-offset-2 ring-offset-white dark:ring-offset-[#171717]'
                : 'hover:scale-105'
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc(icon.id)}
              alt={icon.name}
              className="w-full aspect-square rounded-xl"
            />
            {current === icon.id && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#8b5cf6] flex items-center justify-center shadow">
                <Check size={13} className="text-white" strokeWidth={3} />
              </span>
            )}
            <span className="block text-[10px] text-center mt-1 text-gray-500 dark:text-white/40 truncate">
              {icon.name}
            </span>
          </button>
        ))}
      </div>

      {note && <p className="text-[11px] text-gray-400 dark:text-white/30 mt-3">{note}</p>}
    </div>
  );
}

