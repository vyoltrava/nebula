import { useState, useEffect, useCallback } from 'react';
import { sanitizeSvg } from '@/lib/sanitize';
import { getToken } from '@/lib/auth';
import { decryptAnchorWithPin, reconstructKey } from '@/lib/prismCrypto';
import { prismStorage } from '@/lib/prismStorage';

interface PrismObject {
  id: string;
  type: string;
  x: number;
  y: number;
  size: number;
  color: string;
}

interface PrismLandscapeData {
  chat_id: number;
  genesis_type?: string | null;
  shard2: string;
  has_anchor?: boolean;
  prism_anchor: string;
  other?: { id: number; display_name: string; avatar_url: string | null } | null;
}

interface PrismPuzzleEnterProps {
  chatId: number;
  onEnterSuccess: () => void;
}

export function PrismPuzzleEnter({ chatId, onEnterSuccess }: PrismPuzzleEnterProps) {
  const [landscape, setLandscape] = useState<PrismLandscapeData | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [landscapeSvg, setLandscapeSvg] = useState('');
  const [objects, setObjects] = useState<PrismObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'pin' | 'select' | 'confirm'>('pin');

  // 1. Загружаем пейзаж (shard2 + prism_anchor) при монтировании
  useEffect(() => {
    const fetchLandscape = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-landscape`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) throw new Error('Ошибка загрузки');
        const data = await res.json();
        setLandscape(data);
      } catch (err) {
        setError('Не удалось загрузить головоломку');
      }
    };
    fetchLandscape();
  }, [chatId]);

  // 2. Ввод PIN-а: расшифровка shard1, реконструкция master key, генерация пазла
  const handleUnlock = useCallback(async () => {
    if (!landscape || !pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      const shard1Base64 = await decryptAnchorWithPin(landscape.prism_anchor, pin);
      const shard3 = await prismStorage.getShard(chatId);
      if (!shard3) throw new Error('Локальный фрагмент ключа (shard3) не найден');
      const key = reconstructKey(shard1Base64, landscape.shard2, shard3);

      const { generatePrismPuzzleSVG } = await import('@/lib/prismPuzzle');
      const { svg, objects } = generatePrismPuzzleSVG(key);
      setLandscapeSvg(svg);
      setObjects(objects as unknown as PrismObject[]);
      setUnlocked(true);
      setStep('select');
    } catch (e: any) {
      setPinError(e.message || 'Неверный PIN-код');
    } finally {
      setLoading(false);
    }
  }, [landscape, pin, chatId]);

  // 3. Обработка клика по объекту
  const handleObjectClick = (obj: PrismObject) => {
    if (step === 'confirm') return;
    setSelectedObjectId(obj.id);
    setStep('confirm');
    setError('');
  };

  // 4. Отправка выбора на сервер (подтверждение входа)
  const handleSubmit = useCallback(async () => {
    if (!selectedObjectId) return;
    setLoading(true);
    setError('');
    const token = getToken();
    if (!token) return;

    try {
      const formData = new FormData();
      formData.append('object_id', selectedObjectId);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chats/${chatId}/prism-enter`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Неверный объект');
      }

      onEnterSuccess();
    } catch (err: any) {
      setError(err.message || 'Ошибка расшифровки. Попробуйте другой объект.');
      setStep('select');
      setSelectedObjectId(null);
    } finally {
      setLoading(false);
    }
  }, [selectedObjectId, chatId, onEnterSuccess]);

  if (!landscape) return <div className="p-6 text-gray-900 dark:text-white">Загрузка пейзажа...</div>;
  if (!landscape) {
    return <div className="p-6 text-gray-900 dark:text-white">Загрузка пейзажа...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-[#0f1225] rounded-xl border border-line dark:border-white/10 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">Prism Decryption</h2>

      {step === 'pin' && (
        <div className="space-y-4">
          <p className="text-gray-400 text-sm text-center">
            Введите PIN-код для расшифровки фрагмента ключа (shard1)
          </p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN-код"
            className="w-full px-4 py-3 bg-white/5 border border-line dark:border-white/10 rounded-lg text-center tracking-widest focus:outline-none focus:border-cyan-500/60 transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            disabled={loading}
          />
          {pinError && <p className="text-sm text-red-500 text-center">{pinError}</p>}
          <button
            onClick={handleUnlock}
            disabled={!pin.trim() || loading}
            className="w-full p-3 rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600 text-gray-900 dark:text-white font-bold disabled:opacity-50 transition-all"
          >
            {loading ? 'Расшифровка...' : 'Разблокировать'}
          </button>
        </div>
      )}

      {unlocked && (
        <>
          <p className="text-gray-400 text-sm mb-4 text-center">
            {step === 'select'
              ? 'Выберите объект, который служит вашим ключом'
              : 'Подтвердите выбор этого объекта для расшифровки'}
          </p>

          <div className="relative w-full aspect-[4/3] bg-gray-50 dark:bg-[#050714] rounded-lg overflow-hidden border border-cyan-500/30 mb-4 shadow-[0_0_30px_rgba(6,182,212,0.1)]">
            <div dangerouslySetInnerHTML={{ __html: sanitizeSvg(landscapeSvg) }} className="absolute inset-0 opacity-50 pointer-events-none" />

            <svg viewBox="0 0 800 600" className="absolute inset-0 w-full h-full">
              {objects.map((obj) => {
                const isSelected = selectedObjectId === obj.id;
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
                return (
                  <circle
                    {...commonProps}
                    cx={obj.x}
                    cy={obj.y}
                    r={obj.size * (isSelected ? 1.5 : 1)}
                    fill={isSelected ? '#00ffff' : obj.color}
                  />
                );
              })}
            </svg>

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
        </>
      )}
    </div>
  );
}
