const LIKED_KEY = "nebula_liked_posts";
const BOOKMARKED_KEY = "nebula_bookmarked_posts";

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
  return readSet(LIKED_KEY).has(postId);
}

export function setLikedCache(postId: number, liked: boolean) {
  const set = readSet(LIKED_KEY);
  liked ? set.add(postId) : set.delete(postId);
  writeSet(LIKED_KEY, set);
}

export function isBookmarkedCached(postId: number): boolean {
  return readSet(BOOKMARKED_KEY).has(postId);
}

export function setBookmarkedCache(postId: number, bookmarked: boolean) {
  const set = readSet(BOOKMARKED_KEY);
  bookmarked ? set.add(postId) : set.delete(postId);
  writeSet(BOOKMARKED_KEY, set);
}