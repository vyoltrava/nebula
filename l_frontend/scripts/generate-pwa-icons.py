"""
Генерация всех PWA-иконок из icon-dark-512.png
Запускается из директории l_frontend/
"""
from PIL import Image
import os

# Исходная иконка
SOURCE = "public/pwa/icon-dark-512.png"
OUTPUT_DIR = "public/pwa"

# Размеры для обычных иконок (purpose: any)
SIZES_ANY = [72, 96, 128, 144, 152, 180, 192, 384, 512]

# Размеры для maskable-иконок (purpose: maskable)
SIZES_MASKABLE = [72, 96, 128, 144, 152, 180, 192, 384, 512]

def resize_icon(source_path, size, output_path):
    """Ресайзит иконку с правильным сглаживанием"""
    img = Image.open(source_path).convert("RGBA")
    img_resized = img.resize((size, size), Image.Resampling.LANCZOS)
    img_resized.save(output_path, "PNG")
    print(f"✓ {output_path} ({size}x{size})")

def main():
    if not os.path.exists(SOURCE):
        print(f"❌ Исходный файл не найден: {SOURCE}")
        return

    # Генерируем обычные иконки
    for size in SIZES_ANY:
        output_path = os.path.join(OUTPUT_DIR, f"icon-{size}.png")
        resize_icon(SOURCE, size, output_path)

    # Генерируем maskable-иконки (те же, можно использовать те же файлы)
    # Maskable-иконки обычно имеют больший отступ, но для простоты используем те же
    for size in SIZES_MASKABLE:
        output_path = os.path.join(OUTPUT_DIR, f"maskable-{size}.png")
        resize_icon(SOURCE, size, output_path)

    print(f"\n✅ Все иконки сгенерированы из {SOURCE}")

if __name__ == "__main__":
    main()