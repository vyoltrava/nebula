export const feedRefreshEvent = new EventTarget();

export function triggerFeedRefresh() {
  feedRefreshEvent.dispatchEvent(new Event("refresh"));
}

export function onFeedRefresh(callback: () => void) {
  feedRefreshEvent.addEventListener("refresh", callback);
  return () => feedRefreshEvent.removeEventListener("refresh", callback);
}