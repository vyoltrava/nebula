'use client';
import { QRCodeCanvas } from 'qrcode.react';

interface Props {
  value: string;
  size?: number;
  fg?: string;
  bg?: string;
  /** Дефолтный логотип (public), если аватарки нет. */
  logo?: string;
  /** Аватарка пользователя — рисуется в центре квадратом со скруглёнными углами. */
  avatarUrl?: string | null;
  level?: 'L' | 'M' | 'Q' | 'H';
}

/**
 * «Красивый» QR-код: фирменный цвет + картинка в центре (вместо стандартного ч/б).
 * - с avatarUrl: аватарка в центре в квадрате со скруглёнными углами и белой подложкой;
 * - без avatarUrl: логотип из public/pwa (единый источник).
 * Фон всегда белый — для считываемости. С аватаркой уровень коррекции повышаем до H,
 * чтобы QR оставался читаемым при перекрытии центра.
 */
export default function PrettyQR({
  value,
  size = 220,
  fg = '#8b5cf6',
  bg = '#ffffff',
  logo = '/pwa/icon-512.png',
  avatarUrl,
  level,
}: Props) {
  if (!value) return null;

  const withAvatar = !!avatarUrl;
  const lvl = level || (withAvatar ? 'H' : 'M');
  const avatarBox = Math.round(size * 0.26); // квадрат с подложкой (включая белые поля)

  return (
    <div className="relative inline-block rounded-2xl bg-white p-2.5 shadow-lg ring-1 ring-black/5">
      <QRCodeCanvas
        value={value}
        size={size}
        bgColor={bg}
        fgColor={fg}
        level={lvl}
        marginSize={1}
        imageSettings={
          withAvatar
            ? undefined
            : {
                src: logo,
                height: Math.round(size * 0.2),
                width: Math.round(size * 0.2),
                excavate: true,
              }
        }
      />
      {withAvatar && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-sm"
          style={{ width: avatarBox, height: avatarBox, padding: Math.max(2, Math.round(size * 0.012)) }}
        >
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full rounded-lg object-cover"
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
