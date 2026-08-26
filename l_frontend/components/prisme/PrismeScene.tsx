"use client";
import { useEffect, useRef } from "react";

export interface PrismeSceneObject {
  id: number;
  slot: number;
  kind: string;
  label?: string;
  x: number;
  y: number;
  size: number;
  color: string;
  status: "free" | "occupied";
  /** Поля, которые бэкенд присылает для занятых объектов: */
  chat_id?: number | null;
  i_am_member?: boolean;
  owner_username?: string | null;
  owner_display_name?: string | null;
}

interface PrismeSceneProps {
  svg: string;
  objects?: PrismeSceneObject[];
  selectedSlot?: number | null;
  interactive?: boolean;
  /** Разрешить клики и по занятым объектам (режим админа). */
  allowOccupiedClick?: boolean;
  /** Клик по занятому объекту = попытка входа в чат по ключу. */
  onSelectOccupied?: (obj: PrismeSceneObject) => void;
  onSelect?: (obj: PrismeSceneObject) => void;
  hint?: string;
}

/**
 * Интерактивная SVG-картинка Prisme.
 * Свободные объекты (<g class="prisme-free" data-slot="N">) кликабельны — создание чата.
 * Занятые кликабельны при allowOccupiedClick (админ) или onSelectOccupied (вход по ключу).
 */
export function PrismeScene({
  svg,
  objects = [],
  selectedSlot = null,
  interactive = true,
  allowOccupiedClick = false,
  onSelectOccupied,
  onSelect,
  hint,
}: PrismeSceneProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const objectsRef = useRef(objects);
  const onSelectRef = useRef(onSelect);
  const onSelectOccupiedRef = useRef(onSelectOccupied);
  const interactiveRef = useRef(interactive);
  const allowOccupiedRef = useRef(allowOccupiedClick);

  // Синхронизация refs после рендера (в refs нельзя писать во время рендера)
  useEffect(() => {
    objectsRef.current = objects;
    onSelectRef.current = onSelect;
    onSelectOccupiedRef.current = onSelectOccupied;
    interactiveRef.current = interactive;
    allowOccupiedRef.current = allowOccupiedClick;
  });

  const joinable = !!onSelectOccupied || allowOccupiedClick;

  // Пост-обработка инжектированного SVG: клики, клавиатура, aria.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const svgEl = frame.querySelector("svg");
    if (!svgEl) return;

    const getObject = (g: Element): PrismeSceneObject | null => {
      const slot = Number(g.getAttribute("data-slot"));
      return objectsRef.current.find((o) => o.slot === slot) || null;
    };

    const selectByGroup = (g: Element) => {
      if (!interactiveRef.current) return;
      const isFree = g.classList.contains("prisme-free");
      const obj = getObject(g);
      if (!obj) return;
      if (isFree) {
        onSelectRef.current?.(obj);
      } else if (onSelectOccupiedRef.current) {
        onSelectOccupiedRef.current(obj);
      } else if (allowOccupiedRef.current) {
        onSelectRef.current?.(obj);
      }
    };

    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const g = t.closest?.("g[data-slot]") as Element | null;
      if (g) selectByGroup(g);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target as Element;
      if (el?.classList?.contains("prisme-free") ||
          (joinable && el?.classList?.contains("prisme-occupied"))) {
        e.preventDefault();
        selectByGroup(el);
      }
    };

    // Доступность: focusable объекты с подписями
    svgEl.querySelectorAll<SVGGElement>("g[data-slot]").forEach((g) => {
      const slot = g.getAttribute("data-slot") || "";
      const kind = g.getAttribute("data-kind") || "object";
      const isFree = g.classList.contains("prisme-free");
      if (isFree || joinable) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute(
          "aria-label",
          isFree
            ? `Свободный объект ${kind}, ключ #${slot}`
            : `Занятый объект ${kind}, ключ #${slot} — вход в чат по ключу`
        );
        g.style.outline = "none";
      }
    });
    svgEl.addEventListener("click", onClick);
    svgEl.addEventListener("keydown", onKey as EventListener);

    // Отметка выбранного объекта
    const markSelected = () => {
      svgEl.querySelectorAll<SVGGElement>("g[data-slot].is-selected").forEach((g) =>
        g.classList.remove("is-selected")
      );
      if (selectedSlot != null) {
        const sel = svgEl.querySelector<SVGGElement>(`g[data-slot="${selectedSlot}"]`);
        sel?.classList.add("is-selected");
      }
    };
    markSelected();

    return () => {
      svgEl.removeEventListener("click", onClick);
      svgEl.removeEventListener("keydown", onKey as EventListener);
    };
  }, [svg, selectedSlot, joinable]);

  return (
    <div
      ref={frameRef}
      className={`prisme prisme-frame relative w-full overflow-hidden${joinable ? " prisme-joinable" : ""}`}
    >
      <div
        className="w-full"
        style={{ aspectRatio: "1200 / 800" }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {hint && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none bg-[#0A0E27]/85 border border-[#00F5FF]/40 text-[#00F5FF] text-xs font-mono tracking-wide px-4 py-1.5 rounded-full shadow-[0_0_16px_rgba(0,245,255,0.2)]">
          {hint}
        </div>
      )}
    </div>
  );
}