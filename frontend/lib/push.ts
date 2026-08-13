const API = process.env.NEXT_PUBLIC_API_URL!;

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
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
  const { public_key } = await vapidRes.json();

    const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: public_key,  // base64url строка — Push API принимает её напрямую
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