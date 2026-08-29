"use client";
import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";

type Point = { x: number; y: number };

interface AvatarCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImage: Blob) => void;
  onClose: () => void;
}

export function AvatarCropper({ imageSrc, onCropComplete, onClose }: AvatarCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  const onCropChange = (crop: Point) => setCrop(crop);
  const onZoomChange = (zoom: number) => setZoom(zoom);

  const onCropAreaComplete = useCallback((_: any, areaPixels: any) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: any
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Делаем квадрат 400x400
    const size = 400;
    canvas.width = size;
    canvas.height = size;

    // Рисуем обрезанную часть
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      size,
      size
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, "image/jpeg", 0.92);
    });
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
    onCropComplete(croppedImage);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[300] flex flex-col">
      {/* Шапка */}
      <div className="flex items-center justify-between p-4 border-b border-line dark:border-white/10">
        <h2 className="text-gray-900 dark:text-white font-bold text-lg">Настройте аватарку</h2>
        <div className="flex items-center gap-2">
          <IconButton icon={X} size="icon" onClick={onClose} />
        </div>
      </div>

      {/* Cropper */}
      <div className="flex-1 relative min-h-0">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid={false}
          style={{ cropAreaStyle: { borderRadius: "16px", border: "2px solid #8b5cf6" } }}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropAreaComplete}
        />
      </div>

      {/* Контролы */}
      <div className="p-4 border-t border-line dark:border-white/10 space-y-4 bg-paper dark:bg-[#171717]">
        {/* Зум */}
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <ZoomOut size={16} className="text-gray-600 dark:text-white/50" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[#8b5cf6]"
          />
          <ZoomIn size={16} className="text-gray-600 dark:text-white/50" />
        </div>

        {/* Кнопки */}
        <div className="flex gap-3 max-w-md mx-auto">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Отмена
          </Button>
          <Button icon={Check} onClick={handleSave} className="flex-1">
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}