import { getActiveAccountId } from "./auth";

// 🆕 Лайки/закладки завязаны на текущего зрителя, поэтому и localStorage-ключ
// неймспейсим по активному аккаунту (иначе данные перетекали между аккаунтами).
const LIKED_KEY = "nebula_liked_posts";
const BOOKMARKED_KEY = "nebula_bookmarked_posts";

function scopedKey(base: string): string | null {
  const acc = getActiveAccountId();
  if (acc == null) return null;
  return `${base}_${acc}`;
}

function readSet(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<number>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-500)));
  } catch {}
}

export function isLikedCached(postId: number): boolean {
  const key = scopedKey(LIKED_KEY);
  return key ? readSet(key).has(postId) : false;
}

export function setLikedCache(postId: number, liked: boolean) {
  const key = scopedKey(LIKED_KEY);
  if (!key) return;
  const set = readSet(key);
  liked ? set.add(postId) : set.delete(postId);
  writeSet(key, set);
}

export function isBookmarkedCached(postId: number): boolean {
  const key = scopedKey(BOOKMARKED_KEY);
  return key ? readSet(key).has(postId) : false;
}

export function setBookmarkedCache(postId: number, bookmarked: boolean) {
  const key = scopedKey(BOOKMARKED_KEY);
  if (!key) return;
  const set = readSet(key);
  bookmarked ? set.add(postId) : set.delete(postId);
  writeSet(key, set);
}