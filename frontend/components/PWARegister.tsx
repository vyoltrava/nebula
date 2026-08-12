'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Регистрируем наш sw.js из папки public
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('✅ PWA Service Worker registered:', reg))
        .catch((err) => console.error('❌ PWA SW registration failed:', err));
    }
  }, []);

  return null; // Этот компонент ничего не рисует на экране
}