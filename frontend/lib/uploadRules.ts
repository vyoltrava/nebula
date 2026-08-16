// lib/uploadRules.ts
export const UPLOAD_RULES = {
  avatar: {
    maxBytes: 2 * 1024 * 1024,
    types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    hint: "PNG / JPG / WEBP / GIF · до 2 МБ",
  },
  banner: {
    maxBytes: 5 * 1024 * 1024,
    types: ["image/png", "image/jpeg", "image/webp"],
    minWidth: 1000,
    maxWidth: 4096,
    hint: "PNG / JPG / WEBP · до 5 МБ · ширина 1000–4096px",
  },
} as const;

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

// Проверка формата + размера ДО отправки
export function validateFile(file: File, kind: keyof typeof UPLOAD_RULES): string | null {
  const r = UPLOAD_RULES[kind];
  if (!r.types.includes(file.type as never)) {
    return `Неподдерживаемый формат. Нужно: ${r.types.map((t) => t.split("/")[1].toUpperCase()).join(", ")}.`;
  }
  if (file.size > r.maxBytes) {
    return `Файл ${formatBytes(file.size)} — слишком большой. Лимит: ${formatBytes(r.maxBytes)}.`;
  }
  return null;
}

// Проверка разрешения картинки
export function validateDimensions(file: File, kind: keyof typeof UPLOAD_RULES): Promise<string | null> {
  const r = UPLOAD_RULES[kind] as any;
  if (!r.minWidth && !r.maxWidth) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (r.minWidth && img.width < r.minWidth)
        return resolve(`Слишком маленькая: ${img.width}×${img.height}px. Минимум ${r.minWidth}px по ширине.`);
      if (r.maxWidth && img.width > r.maxWidth)
        return resolve(`Слишком большая: ${img.width}×${img.height}px. Максимум ${r.maxWidth}px.`);
      resolve(null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve("Файл повреждён или это не картинка."); };
    img.src = url;
  });
}

export async function validateUpload(file: File, kind: keyof typeof UPLOAD_RULES): Promise<string | null> {
  return (await validateFile(file, kind)) ?? (await validateDimensions(file, kind));
}

// Человекочитаемая ошибка СЕРВЕРА (вот почему сейчас «молча» не грузится)
export async function uploadErrorText(res: Response): Promise<string> {
  let detail = "";
  try { detail = (await res.json())?.detail || ""; } catch {}
  if (res.status === 413) return "Сервер отклонил файл: слишком большой. Уменьши размер или сожми картинку.";
  if (res.status === 415) return "Сервер не поддерживает этот формат файла.";
  if (res.status === 400) return detail || "Сервер отклонил файл: проверь размер и формат.";
  if (res.status === 401) return "Сессия истекла — войди заново.";
  return detail || `Ошибка загрузки (код ${res.status}).`;
}