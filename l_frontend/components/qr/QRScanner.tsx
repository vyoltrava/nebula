'use client';
import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/LanguageProvider';
import type { MessageKey } from '@/lib/i18n';

const SCAN_ELEMENT_ID = 'nebula-qr-scanner-region';

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (text: string) => void;
}

/** Сканер QR через камеру устройства (html5-qrcode). */
export default function QRScanner({ open, onClose, onScan }: Props) {
  const { t } = useI18n();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<{ msg?: string; key?: MessageKey } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErr(null);
    (async () => {
      try {
        const scanner = new Html5Qrcode(SCAN_ELEMENT_ID, false);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (decoded) => {
            if (cancelled) return;
            onScan(decoded);
            try { scanner.stop(); } catch {}
            try { scanner.clear(); } catch {}
            onClose();
          },
          () => {}
        );
      } catch (e: any) {
        if (!cancelled) setErr({ msg: e?.message, key: 'qr.cameraError' });
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch {}
        try { s.clear(); } catch {}
      }
    };
  }, [open, onScan, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-[#1E1E23] rounded-2xl p-5 max-w-sm w-full text-center border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">{t('qr.scannerModalTitle')}</h3>
          <button onClick={onClose} className="text-[#B9B8BD] hover:text-white p-1" aria-label={t('qr.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="overflow-hidden rounded-xl bg-black">
          <div id={SCAN_ELEMENT_ID} className="w-full [&_video]:!w-full [&_video]:!rounded-xl" />
        </div>
        {err && <p className="text-sm text-red-500 mt-3">{err.key ? t(err.key) : err.msg}</p>}
        <p className="text-xs text-[#B9B8BD] mt-3">{t('qr.scannerModalHint')}</p>
      </div>
    </div>
  );
}
