// components/IconThemeInit.tsx — применяет сохранённую иконку приложения при загрузке
'use client';

import { useEffect } from 'react';
import { initAppIcon } from '@/lib/pwaIcons';

export function IconThemeInit() {
  useEffect(() => {
    initAppIcon();
  }, []);
  return null;
}
