import { useState, useEffect } from 'react';

interface PrismObject {
  id: string;
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface PrismLandscapeData {
  svg: string; // Можно использовать для фона, но мы отрисуем объекты поверх
  objects: PrismObject[];
  my_object_id?: string | null;
}

interface PrismPuzzleEnterProps {
  chatId: number;
  onEnterSuccess: () => void;
}

export function PrismPuzzleEnter({ chatId, onEnterSuccess }: PrismPuzzleEnterProps) {
  const [landscape, setLandscape] = useState<PrismLandscapeData | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  // 1. Загружаем пейзаж при монтировании
  useEffect(() => {
    const fetchLandscape = async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}/prism-landscape`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) throw new Error('Ошибка загрузки');
        const data = await res.json();
        setLandscape(data);
      } catch (err) {
        setError('Не удалось загрузить головоломку');
      }
    };
    fetchLandscape();
  }, [chatId]);

  // 2. Обработка клика по объекту
  const handleObjectClick = (obj: PrismObject) => {
    if (step === 'confirm') return; // Уже выбрали, ждем подтверждения
    
    setSelectedObjectId(obj.id);
    setStep('confirm');
    setError('');
  };

  // 3. Отправка выбора на сервер
  const handleSubmit = async () => {
    if (!selectedObjectId) return;
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('object_id', selectedObjectId);

      const res = await fetch(`/api/chats/${chatId}/prism-enter`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Неверный объект');
      }

      // Успех!
      onEnterSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка расшифровки. Попробуйте другой объект.');
      setStep('select'); // Сбрасываем, чтобы можно было выбрать снова
      setSelectedObjectId(null);
    } finally {
      setLoading(false);
    }
  };

  if (!landscape) return <div className="p-6 text-gray-900 dark:text-white">Загрузка пейзажа...</div>;

  return (
    <div className="p-6 bg-gray-50 dark:bg-[#0f1225] rounded-xl border border-line dark:border-white/10 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">Prism Decryption</h2>
      <p className="text-gray-400 text-sm mb-4 text-center">
        {step === 'select' 
          ? "Выберите объект, который служит вашим ключом" 
          : "Подтвердите выбор этого объекта для расшифровки"}
      </p>

      {/* Контейнер для SVG */}
      <div className="relative w-full aspect-[4/3] bg-gray-50 dark:bg-[#050714] rounded-lg overflow-hidden border border-cyan-500/30 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
        
        {/* Рендерим фоновые элементы из оригинального SVG (не интерактивные) */}
        <div dangerouslySetInnerHTML={{ __html: landscape.svg }} className="absolute inset-0 opacity-50 pointer-events-none" />

        {/* Рендерим ИНТЕРАКТИВНЫЕ объекты поверх */}
        <svg viewBox="0 0 800 600" className="absolute inset-0 w-full h-full">
          {landscape.objects.map((obj) => {
            const isSelected = selectedObjectId === obj.id;
            
            // Базовые стили для объекта
            const commonProps = {
              key: obj.id,
              onClick: () => handleObjectClick(obj),
              className: `cursor-pointer transition-all duration-300 ${
                isSelected ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-110' : 'hover:opacity-80 hover:scale-105'
              }`,
              style: { 
                outline: isSelected ? '2px solid #00ffff' : 'none',
                outlineOffset: '2px'
              }
            };

            if (obj.type === 'star' || obj.type === 'moon') {
              return (
                <circle
                  {...commonProps}
                  cx={obj.x}
                  cy={obj.y}
                  r={obj.size * (isSelected ? 1.5 : 1)}
                  fill={isSelected ? '#00ffff' : obj.color}
                />
              );
            }
            
            if (obj.type === 'window') {
              return (
                <rect
                  {...commonProps}
                  x={obj.x}
                  y={obj.y}
                  width={obj.size}
                  height={obj.size * 1.5}
                  fill={isSelected ? '#00ffff' : obj.color}
                />
              );
            }

            return null;
          })}
        </svg>

        {/* Подсказка при наведении (опционально) */}
        {step === 'select' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-gray-900 dark:text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
            Наведите и нажмите на светящийся объект
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-600 dark:text-red-400 p-3 rounded-lg mb-4 text-sm text-center">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {step === 'confirm' && (
          <button
            onClick={() => { setStep('select'); setSelectedObjectId(null); }}
            disabled={loading}
            className="flex-1 p-3 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-line dark:border-white/20 rounded-lg text-gray-900 dark:text-white font-medium transition-colors"
          >
            Отмена
          </button>
        )}
        
        <button
          onClick={handleSubmit}
          disabled={loading || step === 'select'}
          className={`flex-1 p-3 rounded-lg text-gray-900 dark:text-white font-bold transition-all ${
            step === 'select' 
              ? 'bg-gray-700 cursor-not-allowed opacity-50' 
              : 'bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 dark:hover:from-cyan-400 hover:to-purple-500 shadow-lg shadow-cyan-500/20'
          }`}
        >
          {loading ? 'Проверка ключа...' : 'Расшифровать чат'}
        </button>
      </div>
    </div>
  );
}