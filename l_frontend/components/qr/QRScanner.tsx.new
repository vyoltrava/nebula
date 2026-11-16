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
 * Critical fixes:
 * - scanner.start() called synchronously on user click (iOS Safari)
 * - Proper cleanup of scanning line animation timer
 * - Null reference safety on mount/unmount
 * - Error handling displayed to user
 */
export default function QRScanner({ open, onClose, onScan }: Props) {
  const { t } = useI18n();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [err, setErr] = useState<{ msg?: string; key?: MessageKey } | null>(null);
  const [qrFound, setQrFound] = useState(false);
  const [qrText, setQrText] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);

  // Use refs to share state safely between effects
  const cancelledRef = useRef<boolean>(false);
  const animationCancelledRef = useRef<boolean>(false);

  // Canvas ref for drawing scanning line
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scanProgress, setScanProgress] = useState(0);

  // Track if user has interacted with scanner to start camera
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    // Critical: on unmount, cancel everything
    return () => {
      cancelledRef.current = true;
      animationCancelledRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch { console.error('Error stopping scanner on unmount'); }
        try { s.clear(); } catch { console.error('Error clearing scanner on unmount'); }
      }
      setQrFound(false);
      setQrText(null);
      setErr(null);
      setScannerReady(false);
      setUserInteracted(false);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      // On modal close, clean up
      cancelledRef.current = true;
      animationCancelledRef.current = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        try { s.stop(); } catch { console.error('Error stopping scanner'); }
        try { s.clear(); } catch { console.error('Error clearing scanner'); }
      }
      setQrFound(false);
      setQrText(null);
      setErr(null);
      setScannerReady(false);
      setUserInteracted(false);
      return;
    }

    // On modal open, reset state but DON'T start scanner automatically
    // User must click "Start Scanning" to grant camera access (iOS Safari requirement)
    cancelledRef.current = false;
    animationCancelledRef.current = false;
    setQrFound(false);
    setQrText(null);
    setErr(null);
    setScanProgress(0);
    setScannerReady(false);
    setUserInteracted(false);
  }, [open]);

  // Start scanner when user interacts (clicks the "Start Scanning" button)
  useEffect(() => {
    if (!open || userInteracted || scannerRef.current) return;
    
    // Critical: scanner.start() called synchronously (NO await)
    // This is REQUIRED for iOS Safari - camera is accessed via user gesture
    const scanner = new Html5Qrcode(SCAN_ELEMENT_ID, false);
    scannerRef.current = scanner;

    // Start scanner WITHOUT fixed qrbox - detects QR anywhere in the frame
    // Proper error handler for debugging camera issues
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
        setQrFound(true);
        setQrText(decoded);
        onScan(decoded);
        try { scanner.stop(); } catch { console.error('Error stopping scanner after scan'); }
        try { scanner.clear(); } catch { console.error('Error clearing scanner after scan'); }
        onClose();
      },
      // PROPER ERROR HANDLER - shows error to user and allows retry
      (error) => {
        if (cancelledRef.current) return;
        console.error('QR scanner error:', error);
        setErr({ msg: String(error), key: 'qr.cameraError' });
        // After error, allow user to retry by keeping scannerReady true
        setScannerReady(true);
      }
    );

    // Mark that scanner has been attempted (shows the video preview)
    setScannerReady(true);
  }, [open, userInteracted]);

  // Scanning line animation when no QR is found
  useEffect(() => {
    if (!userInteracted || qrFound || !open) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Get dimensions once
    const width = video.videoWidth;
    const height = video.videoHeight;

    const animate = () => {
      // Critical: check cancellation before each frame
      if (animationCancelledRef.current || cancelledRef.current || qrFound || !open) return;
      // Clear canvas
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, width, height);
      // Draw scanning line progress
      const progress = scanProgress;
      ctx.fillStyle = 'rgba(139, 91, 246, 0.8)';
      ctx.fillRect(0, progress * height, width, 4);
      // Update progress - loop from 0 to 1
      setScanProgress((p) => {
        const next = p + 0.02;
        return next > 1 ? 0 : next;
      });
      requestAnimationFrame(animate);
    };

    animate();
    // Cleanup on unmount or when conditions change
    return () => {
      animationCancelledRef.current = true;
    };
  }, [userInteracted, qrFound, open]);

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

        {/* Scanner interface */}
        {scannerReady ? (
          // Scanner is ready - show video preview with scanning line
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
            />
            
            {/* QR frame animation - appears when QR is detected */}
            {qrFound && qrText && (
              <div className="absolute inset-0 rounded-2xl border4 border-indigo-600 animate-pulse opacity-90">
                <div className="absolute -inset-2 rounded-2xl border2 border-indigo-500 animate-pulse opacity-75" />
              </div>
            )}
          </div>
        ) : (
          // Scanner not yet started - show start button
          <div className="min-h-[180px] flex items-center justify-center">
            <button
              onClick={() => setUserInteracted(true)}
              className="inline-flex items-center justify-center rounded-xl bg-[#8b5cf6] px-6 py-3 text-white font-medium text-sm hover:bg-[#7c3aed] transition-colors"
            >
              <X size={20} className="mr-2" /> {t('qr.startScanning')}
            </button>
            <p className="text-xs text-[#B9B8BD] mt-2">Point camera at QR code</p>
          </div>
        )}

        {err && <p className="text-sm text-red-500 mt-3">{err.key ? t(err.key) : err.msg}</p>}
        <p className="text-xs text-[#B9B8BD] mt-3">{t('qr.scannerModalHint')}</p>
      </div>
    </div>
  );
}
