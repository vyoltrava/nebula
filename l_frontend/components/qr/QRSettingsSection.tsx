'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ScanLine, User, LogIn, CheckCircle2 } from 'lucide-react';
import QRModal from './QRModal';
import QRScanner from './QRScanner';
import { mediaUrl } from '@/lib/media';
import { getProfileUrl, confirmLoginQr, resolveScanned } from '@/lib/qr';

interface Props {
  user?: { username?: string; avatar_url?: string | null } | null;
}

/**
 * Секция «QR-коды» для настроек: QR профиля + сканер (подтверждение входа с аккаунта).
 * Используется и в Nebula, и в расширенной (классической) версии настроек.
 * Схема входа: логин-окно показывает QR, а отсюда сканером его подтверждаешь.
 */
export default function QRSettingsSection({ user }: Props) {
  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanStatus, setScanStatus] = useState('');

  useEffect(() => {
    setProfileUrl(user?.username ? getProfileUrl(user.username) : '');
  }, [user?.username]);

  const handleScan = async (text: string) => {
    if (!text) return;
    const res = resolveScanned(text);
    if (!res) {
      setScanStatus('');
      setScanError('Не удалось распознать QR');
      return;
    }
    if (res.kind === 'qrconfirm') {
      // С аккаунта подтверждаем вход на другом устройстве
      setScanError('');
      setScanStatus('Подтверждаю вход…');
      const r = await confirmLoginQr(res.code);
      if (r.ok) {
        setScanStatus(`✓ Вход подтверждён: @${r.user?.username || ''}`);
      } else {
        setScanStatus('');
        setScanError(r.error || 'Не удалось подтвердить вход');
      }
      return;
    }
    // Ссылка (например, на профиль)
    router.push(res.href);
  };

  const cardCls = 'rounded-2xl bg-white dark:bg-[#1E1E23] border border-line dark:border-white/10 p-5';
  const btnCls =
    'w-full inline-flex items-center justify-center gap-2 rounded-xl text-white text-sm font-semibold py-3 transition-colors disabled:opacity-50';

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#B9B8BD]">
        QR-коды для быстрого перехода на профиль и входа с другого устройства: на экране входа
        откройте «Войти по QR» и отсканируйте код этим сканером.
      </p>

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

      {/* Сканер: подтверждение входа */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
            <LogIn size={18} className="text-[#10b981]" />
          </div>
          <div>
            <div className="text-sm font-semibold">Сканер QR</div>
            <div className="text-xs text-[#B9B8BD]">Подтверждает вход на другом устройстве</div>
          </div>
        </div>
        <button onClick={() => { setScanError(''); setScanStatus(''); setScanOpen(true); }} className={btnCls + ' bg-[#10b981] hover:bg-[#0ea371]'}>
          <ScanLine size={16} /> Сканировать QR входа
        </button>
        {scanStatus && (
          <p className="text-sm text-[#10b981] mt-3 flex items-center gap-1.5">
            <CheckCircle2 size={15} /> {scanStatus}
          </p>
        )}
        {scanError && <p className="text-sm text-red-500 mt-3">{scanError}</p>}
      </div>

      <QRModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        title="Мой QR профиля"
        subtitle={`@${user?.username || ''}`}
        value={profileUrl}
        avatarUrl={user?.avatar_url ? mediaUrl(user.avatar_url) : null}
      />
      <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </div>
  );
}
