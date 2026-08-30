"""
🛡️ Валидация загружаемых файлов по магическим байтам (magic numbers).

Проблема, которую решает: расширение файла и его Content-Type полностью
контролируются клиентом. Злоумышленник может загрузить HTML/SVG с <script>
под видом .jpg → stored XSS через CDN. Проверка magic bytes определяет
РЕАЛЬНЫЙ тип содержимого.
"""
import os
from typing import Optional, Tuple

# Магические подписи (первые байты файла)
MAGIC_SIGNATURES = [
    (b"\xFF\xD8\xFF", "image", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image", "image/png"),
    (b"GIF87a", "image", "image/gif"),
    (b"GIF89a", "image", "image/gif"),
    (b"RIFF", "image", "image/webp"),   # + 'WEBP' на offset 8
]

# Текстовые форматы (небезопасны для прямой отдачи!)
TEXT_SIGNATURES = [
    (b"<?xml", "image", "image/svg+xml"),
    (b"<svg", "image", "image/svg+xml"),
]

VIDEO_SIGNATURES = [
    (b"ftyp", "video", None),           # ISO BMFF (mp4/mov) на offset 4
    (b"\x1A\x45\xDF\xA3", "video", "video/webm"),
]

AUDIO_SIGNATURES = [
    (b"ID3", "audio", "audio/mpeg"),
    (b"\xFF\xFB", "audio", "audio/mpeg"),
    (b"OggS", "audio", "audio/ogg"),
    (b"fLaC", "audio", "audio/flac"),
]

# SVG разрешён только для стикеров/бейджей и отдаётся с nosniff;
# по умолчанию — запрещён (XSS-вектор).
ALLOW_SVG = os.getenv("ALLOW_SVG_UPLOADS", "false").lower() == "true"


def detect_file_kind(header: bytes) -> Tuple[Optional[str], Optional[str]]:
    """Определяет (category, mime) по магическим байтам. (None, None) — не распознано."""
    if not header or len(header) < 8:
        return None, None

    for sig, category, mime in MAGIC_SIGNATURES:
        if header.startswith(sig):
            if sig == b"RIFF" and header[8:12] != b"WEBP":
                continue  # RIFF, но не WEBP (wav и т.п.)
            return category, mime

    for sig, category, mime in VIDEO_SIGNATURES:
        if (sig == b"ftyp" and header[4:8] == b"ftyp") or header.startswith(sig):
            return category, mime

    for sig, category, mime in AUDIO_SIGNATURES + TEXT_SIGNATURES:
        if header.lstrip().startswith(sig):
            if mime == "image/svg+xml" and not ALLOW_SVG:
                return None, None  # SVG блокируем по умолчанию
            return category, mime

    return None, None


def validate_upload(
    header: bytes,
    filename: str,
    content_type: Optional[str],
    allowed_categories: set = {"image"},
    allowed_exts: Optional[set] = None,
) -> Tuple[bool, Optional[str]]:
    """
    Валидирует начало файла (первые 8-16 KB).
    Возвращает (ok, error_message).

    - allowed_exts: если задан, расширение должно входить в него
      (например {'.jpg', '.png'}). None — проверяем только категорию.
    """
    category, mime = detect_file_kind(header)

    if not category:
        return False, "Неизвестный или запрещённый тип файла"

    if category not in allowed_categories:
        return False, f"Тип файла {category} не разрешён"

    if mime == "image/svg+xml":
        return False, "SVG-загрузка запрещена (XSS)"

    ext = os.path.splitext(filename or "")[1].lower()
    if allowed_exts is not None and ext not in allowed_exts:
        return False, f"Расширение {ext} не разрешено"

    return True, None


def check_size_before_read(headers, max_bytes: int) -> Optional[str]:
    """Проверяет Content-Length ДО чтения файла в память (защита от OOM-DoS).
    Возвращает сообщение об ошибке или None."""
    try:
        cl = int(headers.get("content-length") or 0)
    except (TypeError, ValueError):
        cl = 0
    # cl == 0 может значить chunked transfer — тогда проверяем после чтения
    if cl > max_bytes:
        return f"Файл слишком большой (максимум {max_bytes // (1024*1024)} МБ)"
    return None
