const feedRefreshEvent = new EventTarget();

export function triggerFeedRefresh() {
  feedRefreshEvent.dispatchEvent(new Event("refresh"));
}

export function onFeedRefresh(callback: () => void): () => void {
  feedRefreshEvent.addEventListener("refresh", callback);
  return () => feedRefreshEvent.removeEventListener("refresh", callback);
}
type CountersListener = () => void;
const countersListeners = new Set<CountersListener>();

export function onCountersRefresh(listener: CountersListener) {
  countersListeners.add(listener);
  return () => countersListeners.delete(listener);
}

export function triggerCountersRefresh() {
  countersListeners.forEach((l) => l());
}