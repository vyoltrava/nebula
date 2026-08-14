import { useEffect, useRef } from 'react';
import { savePostProgress, getPostProgress } from '@/lib/api';

export function useReadingProgress(postId: number | null) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. ВОССТАНОВЛЕНИЕ: При загрузке страницы забираем прогресс с сервера
  useEffect(() => {
    if (!postId) return;
    
    getPostProgress(postId).then(data => {
      if (data && data.scroll_y > 100) {
        // Небольшая задержка, чтобы DOM и картинки успели отрисоваться
        setTimeout(() => {
          window.scrollTo({ top: data.scroll_y, behavior: 'instant' });
        }, 300);
      }
    }).catch(() => {}); // Игнорируем ошибки, если юзер не авторизован
  }, [postId]);

  // 2. СОХРАНЕНИЕ: Слушаем скролл и отправляем на сервер
  useEffect(() => {
    if (!postId) return;

    const handleScroll = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      // Debounce: ждем 1.5 секунды остановки скролла
      timeoutRef.current = setTimeout(() => {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? Math.min(100, (scrollY / docHeight) * 100) : 0;
        
        savePostProgress(postId, scrollY, percent).catch(() => {});
      }, 1500); 
    };

    // 3. STRAHOVKA: Если юзер закрыл вкладку, отправляем финальный прогресс через Beacon
    const handleBeforeUnload = () => {
       const scrollY = window.scrollY;
       const docHeight = document.documentElement.scrollHeight - window.innerHeight;
       const percent = docHeight > 0 ? Math.min(100, (scrollY / docHeight) * 100) : 0;
       
       const token = localStorage.getItem('token'); // Или как у тебя хранится токен
       const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
       
       // sendBeacon работает асинхронно и гарантированно отправит данные при закрытии
       const blob = new Blob(
           [JSON.stringify({ scroll_y: scrollY, percent_read: percent })], 
           { type: 'application/json' }
       );
       
       // Внимание: sendBeacon не умеет слать кастомные заголовки (Authorization).
       // Если твой бэк требует токен СТРОГО в заголовке, beacon не пройдет.
       // Но если ты добавишь поддержку токена в query-параметрах или cookie, это сработает идеально.
       navigator.sendBeacon(`${apiUrl}/api/posts/${postId}/progress?token=${token}`, blob);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [postId]);
}