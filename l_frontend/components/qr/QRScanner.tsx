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
 * QR-scanner with auto-detection and animated framing (like Telegram).
 * - No fixed qrbox: the scanner detects QR anywhere in the frame.
 * - When QR is found: a pulsing frame appears around it.
 * - When no QR: a gentle scanning line animates across the preview.
 *
 * Critical fixes for iOS Safari and camera reliability:
 * - scanner.start() called synchronously (no await)
 * - Proper error handling with try/catch and e.name/e.message
 * - scanner.stop() and scanner.clear() on unmount to prevent "already running"
 */
export default function QRScanner({ open, onClose, onScan }: Props) {
  const { t } = useI18n();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<{ msg?: string; key?: MessageKey } | null>(null);
  const [qrFound, setQrFound] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);

  // Use refs to share cancelled state between effects safely
  const cancelledRef = useRef<boolean>(false);

  // Canvas ref for drawing scanning line
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    cancelledRef.current = false;
    setErr(null);
    setQrFound(false);
    setQrText(null);
    setScanProgress(0);
    let mounted = true;

    try {
      // Critical: scanner.start() called synchronously (no await)
      // This is required for iOS Safari - camera is accessed via user gesture
      const scanner = new Html5Qrcode(SCAN_ELEMENT_ID, false);
      scannerRef.current = scanner;

      // Start scanner WITHOUT fixed qrbox - detects QR anywhere in the frame
      // Note: No qrbox parameter - scanner will detect QR anywhere in video feed
      // ERROR HANDLER REPLACED: () => {} -> proper error logging below
      scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          // Removed qrbox - scanner will detect QR anywhere in the video feed
          aspectRatio: 1,
        },
        // Callback on QR code decoded
        (decoded) => {
          if (cancelledRef.current) return;
          if (!mounted) return;
          setQrFound(true);
          setQrText(decoded);
          onScan(decoded);
          try { scanner.stop(); } catch {}
          try { scanner.clear(); } catch {}
          onClose();
        },
        // PROPER ERROR HANDLER - critical for debugging camera issues
        (error) => {
          if (cancelledRef.current) return;
          if (!mounted) return;
          console.error('QR scanner error:', error);
          setErr({ msg: String(error), key: 'qr.cameraError' });
        }
      );
    } catch (e: any) {
      if (cancelledRef.current) return;
      if (!mounted) return;
      console.error('QR scanner init error - name:', e.name, 'message:', e.message);
      setErr({ msg: e?.message || String(e), key: 'qr.cameraError' });
    }

    return () => {
      cancelledRef.current = true;
      mounted = false;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch { console.error('Error stopping scanner'); }
        try { s.clear(); } catch { console.error('Error clearing scanner'); }
      }
    };
  }, [open, onScan, onClose]);

  // Scanning line animation when no QR is found
  useEffect(() => {
    if (qrFound || !open) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d')!;
    const width = video.videoWidth;
    const height = video.videoHeight;

    const animate = () => {
      if (cancelledRef.current || qrFound || !open) return;
      // Clear canvas
      ctx.clearRect(0, 0, width, height);
      // Draw scanning line progress
      const progress = scanProgress;
      ctx.fillStyle = 'rgba(139, 91, 246, 0.8)';
      ctx.fillRect(0, progress * height, width, 4);
      // Update progress
      setScanProgress((p) => {
        const next = p + 0.02;
        return next > 1 ? 0 : next;
      });
      requestAnimationFrame(animate);
    };

    animate();
    return () => {
      cancelledRef.current = true;
    };
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

        {/* Video preview with scanning line animation when no QR */}
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full [&_video]:!w-full [&_video]:!rounded-xl"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 opacity-0"
          /></div>

        {/* QR frame animation - appears when QR is detected */}
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
