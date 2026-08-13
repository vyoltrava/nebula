const API = process.env.NEXT_PUBLIC_API_URL!;

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Safari строго требует Uint8Array с ArrayBuffer, не view
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function enablePush(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "unsupported" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "denied" };

  const reg = await navigator.serviceWorker.register("/sw.js");
  // 🆕 принудительно тянем свежую версию SW (на мобилках старый кэш держится сутками)
  try { await reg.update(); } catch {}
  await navigator.serviceWorker.ready;

  const vapidRes = await fetch(`${API}/api/push/vapid`);
  if (!vapidRes.ok) return { ok: false, error: "vapid" };
  const { public_key } = await vapidRes.json();

  try {
    // ✅ Safari требует Uint8Array, Chrome принимает и строку и байты
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key),
    });
    const json = sub.toJSON();

    const res = await fetch(`${API}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      }),
    });
    if (!res.ok) return { ok: false, error: "server" };
    return { ok: true };
  } catch (e: any) {
    // 🆕 Ловим точную ошибку (Safari кидает NotSupportedError / NotAllowedError)
    return { ok: false, error: e?.name || "subscribe_error" };
  }
}

export async function disablePush(token: string) {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
  } catch {}
  await fetch(`${API}/api/push/unsubscribe`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getPushEnvironment() {
  if (typeof window === "undefined") return { isIOS: false, isStandalone: false, isInApp: false };
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || ((navigator as any).platform === "MacIntel" && navigator.maxTouchPoints > 2);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  const isInApp = /Telegram|Instagram|FBAN|FBAV|VK|WhatsApp/.test(ua);
  return { isIOS, isStandalone, isInApp };
}