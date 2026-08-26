"use client";

/**
 * Список постов Zune: плитки через разделитель 1px rgba(255,255,255,.05),
 * каскадное появление снизу (slide-up со stagger-задержкой).
 */

import type { CSSProperties } from "react";
import {
  ZunePost,
  type ZunePostData,
} from "./ZunePost";

interface ZunePostListProps {
  posts: ZunePostData[];
  onLike?: (id: ZunePostData["id"]) => void;
  onComment?: (id: ZunePostData["id"]) => void;
  /** Задержка между появлениями постов, ms */
  stagger?: number;
}

export function ZunePostList({
  posts,
  onLike,
  onComment,
  stagger = 70,
}: ZunePostListProps) {
  return (
    <div>
      {posts.map((post, i) => (
        <div key={post.id}>
          <div
            className="zune-anim-slide-up"
            style={{ "--zune-stagger": `${i * stagger}ms` } as CSSProperties}
          >
            <ZunePost post={post} onLike={onLike} onComment={onComment} />
          </div>
          {i < posts.length - 1 ? <hr className="zune-feed-sep" /> : null}
        </div>
      ))}
    </div>
  );
}
