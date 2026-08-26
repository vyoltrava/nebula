"use client";

/**
 * ЭФФЕКТ PANORAMA — фирменный заголовок раздела Windows Phone / Zune.
 *
 *  - гигантская типографика (clamp 56–96px, начертание 100–200);
 *  - уходит за ЛЕВЫЙ КРАЙ экрана (bleed ≈ −22%);
 *  - фиксирован сверху при прокрутке; при скролле >40px «сжимается»
 *    (мельче размер, меньше вынос) с пружинящей анимацией;
 *  - подзаголовок — живая дата и время (как clock/date в системном баре WP);
 *  - pointer-events: none — заголовок лежит фоном, клики проходят сквозь.
 *
 * Компонент ничего не знает о данных страниц — только о маршруте.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";

const SECTION_TITLES: Array<[prefix: string, title: string]> = [
  ["/messages", "СООБЩЕНИЯ"],
  ["/notifications", "УВЕДОМЛЕНИЯ"],
  ["/search", "ПОИСК"],
  ["/settings", "НАСТРОЙКИ"],
  ["/team", "КОМАНДА"],
  ["/stat", "СТАТИСТИКА"],
  ["/updates", "ОБНОВЛЕНИЯ"],
  ["/suggestions", "РЕКОМЕНДАЦИИ"],
  ["/user", "ПРОФИЛЬ"],
  ["/post", "ПОСТ"],
];

function resolveTitle(pathname: string | null): string {
  if (!pathname || pathname === "/") return "ЛЕНТА";
  const hit = SECTION_TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return hit ? hit[1] : "ЛЕНТА";
}

function formatNow(d: Date): string {
  const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

export function ZunePanorama() {
  const pathname = usePathname();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [nowText, setNowText] = useState("");

  /* Хост-элемент портала рядом с телом страницы (вне потока разметки,
     панель сама fixed — врезка безопасна для любой структуры страниц) */
  useEffect(() => {
    let el =
      (document.getElementById("zune-panorama-host") as HTMLDivElement | null);

    const ensure = () => {
      if (!el) {
        el = document.createElement("div");
        el.id = "zune-panorama-host";
      }
      if (el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
      setHost(el);
    };

    const t = setTimeout(ensure, 0);
    return () => {
      clearTimeout(t);
      el?.remove();
      el = null;
      setHost(null);
    };
  }, []);

  /* Сжатие заголовка при скролле (внешняя система → React колбэком) */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Часы-подзаголовок */
  useEffect(() => {
    const tick = () => setNowText(formatNow(new Date()));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (!host) return null;

  return createPortal(
    <header
      className={`zune-panorama${scrolled ? " is-scrolled" : ""}`}
      aria-hidden
    >
      <h1 className="zune-panorama-title">{resolveTitle(pathname)}</h1>
      <p className="zune-panorama-sub">{nowText}</p>
    </header>,
    host
  );
}
