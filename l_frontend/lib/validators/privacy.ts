// lib/validators/privacy.ts
// 🛡 Схема валидации формы настроек приватности профиля.
// В проекте не используются zod/yup — пишем лёгкую типизированную валидацию
// в том же стиле, что и остальной код фронтенда.

export const AUDIENCE_OPTIONS = ["everyone", "followers", "following", "nobody"] as const;
export const COMMENT_OPTIONS = ["everyone", "followers", "following", "mentioned"] as const;

export interface PrivacySettings {
  is_private: boolean;
  allow_messages: (typeof AUDIENCE_OPTIONS)[number];
  allow_calls: (typeof AUDIENCE_OPTIONS)[number];
  allow_comments: (typeof COMMENT_OPTIONS)[number];
  hide_following: boolean;
  hide_followers: boolean;
}

export type PrivacyField = keyof PrivacySettings;
export type PrivacyUpdate = Partial<PrivacySettings>;

const isOneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] =>
  typeof value === "string" && (allowed as readonly string[]).includes(value);

/**
 * Валидирует частичное обновление настроек приватности.
 * @returns { ok: true, data } или { ok: false, error } — human-readable ошибка.
 */
export function validatePrivacyUpdate(
  update: Record<string, unknown>
): { ok: true; data: PrivacyUpdate } | { ok: false; error: string } {
  const data: PrivacyUpdate = {};

  for (const key of ["is_private", "hide_following", "hide_followers"] as const) {
    if (key in update) {
      const v = update[key];
      if (typeof v !== "boolean") return { ok: false, error: `«${key}» должен быть true/false` };
      data[key] = v;
    }
  }

  for (const key of ["allow_messages", "allow_calls"] as const) {
    if (key in update) {
      const v = update[key];
      if (!isOneOf(v, AUDIENCE_OPTIONS))
        return { ok: false, error: `«${key}»: допустимые значения — ${AUDIENCE_OPTIONS.join(", ")}` };
      data[key] = v;
    }
  }

  if ("allow_comments" in update) {
    const v = update.allow_comments;
    if (!isOneOf(v, COMMENT_OPTIONS))
      return { ok: false, error: `«allow_comments»: допустимые значения — ${COMMENT_OPTIONS.join(", ")}` };
    data.allow_comments = v;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "Нет изменений для сохранения" };
  }

  return { ok: true, data };
}
