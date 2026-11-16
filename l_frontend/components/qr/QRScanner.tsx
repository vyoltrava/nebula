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

/**
 * QR-scanner with auto-detection and animated framing.
 * - Fixed qrbox for iOS Safari camera stability
 * - Pulsing frame animation when QR is decoded
 * - Scanning line animation while waiting
 * - Proper error handling displayed to user
 */
export default function QRScanner({ open, onClose, onScan }: Props) {
  const { t } = useI18n();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<{ msg?: string; key?: MessageKey } | null>(null);
  const [qrFound, setQrFound] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);

  // Use refs to share state safely between effects
  const cancelledRef = useRef<boolean>(false);

  // Canvas ref for drawing scanning line
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch { console.error('Error stopping scanner'); }
        try { s.clear(); } catch { console.error('Error clearing scanner'); }
      }
      setQrFound(false);
      setQrText(null);
      setErr(null);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setErr(null);
    setQrFound(false);
    setQrText(null);
    setScanProgress(0);
    (async () => {
      try {
        const scanner = new Html5Qrcode(SCAN_ELEMENT_ID, false);
        scannerRef.current = scanner;
        // Fixed qrbox for iOS Safari camera stability
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
          (decoded) => {
            if (cancelledRef.current) return;
            setQrFound(true);
            setQrText(decoded);
            onScan(decoded);
            try { scanner.stop(); } catch {}
            try { scanner.clear(); } catch {}
            onClose();
          },
          (error) => {
            if (cancelledRef.current) return;
            console.error('QR scanner error:', error);
            setErr({ msg: String(error), key: 'qr.cameraError' });
          }
        );
      } catch (e: any) {
        if (cancelledRef.current) return;
        console.error('QR scanner init error - name:', e.name, 'message:', e.message);
        setErr({ msg: e?.message || String(e), key: 'qr.cameraError' });
      }
    })();
    return () => {
      cancelledRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch {}
        try { s.clear(); } catch {}
      }
    };
  }, [open, onScan, onClose]);

  // Scanning line animation when no QR is found - using canvas overlay
  useEffect(() => {
    if (!qrFound && open) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d')!;
      const width = video.videoWidth;
      const height = video.videoHeight;

      const animate = () => {
        if (cancelledRef.current || qrFound || !open) return;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(139, 91, 246, 0.8)';
        ctx.fillRect(0, (scanProgress % 1) * height, width, 4);
        setScanProgress((p) => (p + 0.02) % 1);
        requestAnimationFrame(animate);
      };

      animate();
    }
  }, [qrFound, open]);

  useEffect(() => {
    if (!open) return;
    return () => {};
  }, [open]);

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
          <canvas
            ref={canvasRef}
            className="absolute inset-0 opacity-0"
          /></div>

        {qrFound && qrText && (
          <div className="absolute inset-0 rounded-2xl border4 border-indigo-600 animate-pulse opacity-90">
            <div className="absolute -inset-2 rounded-2xl border2 border-indigo-500 animate-pulse opacity-75" />
          </div>
        )}

        {err && <p className="text-sm text-red-500 mt-3">{err.key ? t(err.key) : err.msg}</p>}
        <p className="text-xs text-[#B9B8BD] mt-3">{t('qr.scannerModalHint')}</p>
      </div>
    </div>
  );
}
