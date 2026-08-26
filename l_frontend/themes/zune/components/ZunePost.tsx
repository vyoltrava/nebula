"use client";

/**
 * Обёртка-«плитка Metro» для существующих компонентов поста.
 * НЕ переписывает пост: просто оборачивает его и добавляет
 * data-zune-tile, который стилизуется в zune-components.css /
 * zune-animations.css (белая рамка, hover scale 1.02).
 *
 * Пример: <ZunePost><Post post={p} /></ZunePost>
 */

import type { ReactNode } from "react";

interface ZunePostProps {
  children: ReactNode;
  className?: string;
}

export function ZunePost({ children, className }: ZunePostProps) {
  return (
    <div data-zune-tile data-zune-animate className={className}>
      {children}
    </div>
  );
}
