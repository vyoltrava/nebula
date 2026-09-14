'use client';
import { QRCodeCanvas } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  logo?: string;
  level?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * «Красивый» QR-код: фирменный цвет + логотип в центре (вместо стандартного ч/б).
 * Логотип берётся из public/pwa (единый источник), фон всегда белый — для считываемости.
 */
export default function PrettyQR({
  value,
  size = 220,
  fg = '#8b5cf6',
  bg = '#ffffff',
  logo = '/pwa/icon-512.png',
  level = 'M',
}: Props) {
  if (!value) return null;
  return (
    <div className="inline-block rounded-2xl bg-white p-2.5 shadow-lg ring-1 ring-black/5">
      <QRCodeCanvas
        value={value}
        size={size}
        bgColor={bg}
        fgColor={fg}
        level={level}
        marginSize={1}
        imageSettings={{
          src: logo,
          height: Math.round(size * 0.2),
          width: Math.round(size * 0.2),
          excavate: true,
        }}
      />
    </div>
  );
}
