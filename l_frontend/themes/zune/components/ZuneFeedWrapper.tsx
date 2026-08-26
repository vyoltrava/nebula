"use client";

/**
 * Обёртка ленты: НЕ изменяет стандартный Feed/Post.
 * При активной Zune-теме рендерит Zune-версии постов,
 * иначе — переданные стандартные компоненты.
 *
 * Пример использования в любом месте приложения:
 *
 *   import { Post as DefaultPost } from "@/components/Post";
 *
 *   <ZuneFeedWrapper
 *     posts={posts}
 *     renderStandard={(p) => <DefaultPost key={p.id} post={p} />}
 *     renderZune={(p) => (
 *       <ZunePost key={p.id} post={{ id: p.id, author: {...}, ... }} />
 *     )}
 *   />
 */

import type { ReactNode } from "react";
import { useZuneTheme } from "../hooks/useZuneTheme";
import { ZunePostList } from "./ZunePostList";
import type { ZunePostData } from "./ZunePost";

interface ZuneFeedWrapperProps<T> {
  posts: T[];
  /** Рендер стандартного поста (используется, когда тема выключена) */
  renderStandard?: (post: T, index: number) => ReactNode;
  /** Рендер Zune-поста (когда тема включена) */
  renderZune?: (post: T, index: number) => ReactNode;
  /** Преобразование поста к формату ZunePostData (для дефолтного renderZune) */
  toZune?: (post: T) => ZunePostData;
  onLike?: (id: ZunePostData["id"]) => void;
  onComment?: (id: ZunePostData["id"]) => void;
}

export function ZuneFeedWrapper<T>({
  posts,
  renderStandard,
  renderZune,
  toZune,
  onLike,
  onComment,
}: ZuneFeedWrapperProps<T>) {
  const { isZuneTheme } = useZuneTheme();

  if (!isZuneTheme) {
    /* Стандартная ветка: приложение работает ровно как раньше */
    return (
      <>
        {posts.map((post, i) => renderStandard?.(post, i) ?? null)}
      </>
    );
  }

  if (renderZune) {
    return <>{posts.map((post, i) => renderZune(post, i))}</>;
  }

  const zunePosts = toZune ? posts.map(toZune) : (posts as unknown as ZunePostData[]);
  return <ZunePostList posts={zunePosts} onLike={onLike} onComment={onComment} />;
}
