"use client";

/**
 * ZUNE SKIN — лента.
 * Принимает ТЕ ЖЕ данные, что использует стандартная лента:
 * массив постов с плоскими полями стандартного <Post />
 * (id, author, handle, author_avatar, text, media_url, likes_count,
 *  liked_by_me, bookmarked, replies_count, created_at, ...).
 * Все поля пробрасываются в <ZunePost {...post} /> без изменений,
 * поэтому API-логика (лайки/закладки/ответы) работает как в оригинале.
 */

import { Fragment } from "react";
import { ZunePost, type ZunePostData } from "./ZunePost";

interface ZuneFeedProps {
  posts: ZunePostData[];
}

export function ZuneFeed({ posts }: ZuneFeedProps) {
  return (
    <div className="zune-feed">
      {posts.map((post, i) => (
        <Fragment key={post.id}>
          <ZunePost post={post} />
          {i < posts.length - 1 ? <hr className="zune-feed-sep" /> : null}
        </Fragment>
      ))}
    </div>
  );
}
