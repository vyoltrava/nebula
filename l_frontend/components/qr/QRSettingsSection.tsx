'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ScanLine, User, LogIn, Loader2 } from 'lucide-react';
import QRModal from './QRModal';
import QRScanner from './QRScanner';
import { getProfileUrl, createLoginQr, resolveScanned } from '@/lib/qr';

interface Props {
  user?: { username?: string } | null;
}

/**
 * Секция «QR-коды» для настроек: QR профиля + вход по QR + сканер.
 * Используется и в Nebula, и в расширенной (классической) версии настроек.
 */
export default function QRSettingsSection({ user }: Props) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [loginQr, setLoginQr] = useState<{ value: string; expiresIn: number; error?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    setProfileUrl(user?.username ? getProfileUrl(user.username) : '');
  }, [user?.username]);

  const makeLoginQr = async () => {
    setCreating(true);
    setScanError('');
    const r = await createLoginQr();
    setCreating(false);
    if (r.error) {
      setScanError(r.error);
      return;
    }
    setLoginQr({ value: r.qrUrl, expiresIn: r.expiresIn });
  };

  const handleScan = (text: string) => {
    if (!text) return;
    const resolved = resolveScanned(text);
    if (resolved) {
      router.push(resolved.href);
    } else {
      setScanError('Не удалось распознать QR');
    }
  };

  const cardCls = 'rounded-2xl bg-white dark:bg-[#1E1E23] border border-line dark:border-white/10 p-5';
  const btnCls =
    'w-full inline-flex items-center justify-center gap-2 rounded-xl text-white text-sm font-semibold py-3 transition-colors disabled:opacity-50';

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#B9B8BD]">QR-коды для быстрого перехода на профиль и входа с другого устройства.</p>

      {/* QR профиля */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center">
            <User size={18} className="text-[#8b5cf6]" />
          </div>
          <div>
            <div className="text-sm font-semibold">QR моего профиля</div>
            <div className="text-xs text-[#B9B8BD]">Ссылка на профиль @{user?.username || '…'}</div>
          </div>
        </div>
        <button disabled={!profileUrl} onClick={() => setShowProfile(true)} className={btnCls + ' bg-[#8b5cf6] hover:bg-[#7c3aed]'}>
          <QrCode size={16} /> Показать QR профиля
        </button>
      </div>

      {/* Вход по QR */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
            <LogIn size={18} className="text-[#10b981]" />
          </div>
          <div>
            <div className="text-sm font-semibold">Быстрый вход по QR</div>
            <div className="text-xs text-[#B9B8BD]">Просканируйте с другого устройства, чтобы войти без пароля</div>
          </div>
        </div>
        <button onClick={makeLoginQr} disabled={creating} className={btnCls + ' bg-[#10b981] hover:bg-[#0ea371]'}>
          {creating ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />} Создать QR входа
        </button>
      </div>

      {/* Сканер */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <ScanLine size={18} className="text-amber-500" />
          </div>
          <div>
            <div className="text-sm font-semibold">Сканер QR</div>
            <div className="text-xs text-[#B9B8BD]">Распознаёт профили и QR входа</div>
          </div>
        </div>
        <button onClick={() => { setScanError(''); setScanOpen(true); }} className={btnCls + ' bg-amber-500 hover:bg-amber-600'}>
          <ScanLine size={16} /> Сканировать
        </button>
        {scanError && <p className="text-sm text-red-500 mt-3">{scanError}</p>}
      </div>

      <QRModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        title="Мой QR профиля"
        subtitle={`@${user?.username || ''}`}
        value={profileUrl}
      />
      <QRModal
        open={!!loginQr}
        onClose={() => setLoginQr(null)}
        title="Вход по QR"
        subtitle={loginQr ? `Действует ~${Math.max(1, Math.round((loginQr.expiresIn || 120) / 60))} мин · один раз` : ''}
        value={loginQr?.value || ''}
      />
      <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </div>
  );
}
