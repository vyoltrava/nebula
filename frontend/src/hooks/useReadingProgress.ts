import { useEffect, useRef } from 'react';
import { savePostProgress, getPostProgress } from '@/lib/api';

export function useReadingProgress(postId: number | null) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. ВОССТАНОВЛЕНИЕ: При загрузке страницы забираем прогресс с сервера
  useEffect(() => {
    if (!postId) return;
    
    getPostProgress(postId).then(data => {
      // ✅ Восстанавливаем скролл ТОЛЬКО если пост не прочитан до конца
      if (data && data.scroll_y > 100 && data.percent_read < 95) {
        setTimeout(() => {
          window.scrollTo({ top: data.scroll_y, behavior: 'instant' });
        }, 300);
      }
    }).catch(() => {}); 
  }, [postId]);

  // 2. СОХРАНЕНИЕ: Слушаем скролл и отправляем на сервер
  useEffect(() => {
    if (!postId) return;

    const handleScroll = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? Math.min(100, (scrollY / docHeight) * 100) : 0;
        
        savePostProgress(postId, scrollY, percent).catch(() => {});
      }, 1500); 
    };

    // 3. ФИНАЛЬНОЕ СОХРАНЕНИЕ ПРИ ЗАКРЫТИИ ВКЛАДКИ
    const handleBeforeUnload = () => {
       const scrollY = window.scrollY;
       const docHeight = document.documentElement.scrollHeight - window.innerHeight;
       const percent = docHeight > 0 ? Math.min(100, (scrollY / docHeight) * 100) : 0;
       
       const token = localStorage.getItem('token');
       const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
       
       // ❌ sendBeacon НЕ поддерживает заголовки, бэк отдавал 401 и прогресс терялся!
       // ✅ fetch с keepalive: true — идеальная замена, поддерживает Authorization
       fetch(`${apiUrl}/api/posts/${postId}/progress`, {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json',
               ...(token ? { Authorization: `Bearer ${token}` } : {}),
           },
           body: JSON.stringify({ scroll_y: scrollY, percent_read: percent }),
           keepalive: true, // Гарантирует отправку запроса при уничтожении страницы
       }).catch(() => {});
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