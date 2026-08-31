import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 🍪 SSR-проверка cookie-подсказки `nebula_auth_hint`.
 *
 * Подсказка ставится при логине/переключении аккаунта (lib/cookieManager.ts)
 * и НЕ является токеном — это лишь признак «на устройстве есть сессия».
 * Она позволяет на сервере, ДО первого рендера, понять, что пользователь
 * залогинен, и не отдавать ему /login (устраняет мерцание и лишний редирект).
 *
 * Реальная авторизация по-прежнему проверяется на API (Bearer-токен +
 * httpOnly refresh-cookie на домене API).
 */
const AUTH_HINT = "nebula_auth_hint";

export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(AUTH_HINT)?.value);

  // Залогиненного не пускаем на страницы входа — возвращаем в ленту.
  if (hasSession && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login"],
};
