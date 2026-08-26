"use client";

/**
 * Пост-плитка Metro — Zune-версия стандартного поста.
 * Полностью самостоятельный компонент (стандартный Post не тронут):
 *  - плитка #1A1A1A с белой границей rgba(255,255,255,.1), без теней;
 *  - аватар круглый с маджентовой обводкой 2px + пульс раз в 3с;
 *  - имя 600/белый, дата 12px/rgba(.4);
 *  - действия «Лайк/Коммент» — плоские, hover подчёркивание.
 */

export interface ZunePostAuthor {
  name: string;
  avatarUrl?: string | null;
}

export interface ZunePostData {
  id: number | string;
  author: ZunePostAuthor;
  /** Дата в любом формате отображения, например "2 ч назад" */
  createdAt: string;
  text?: string;
  imageUrl?: string | null;
  likes?: number;
  comments?: number;
  liked?: boolean;
}

export interface ZunePostProps {
  post: ZunePostData;
  onLike?: (id: ZunePostData["id"]) => void;
  onComment?: (id: ZunePostData["id"]) => void;
}

export function ZunePost({ post, onLike, onComment }: ZunePostProps) {
  return (
    <article className="zune-post zune-hoverable" data-zune-post-id={post.id}>
      <header className="zune-post-head">
        {post.author.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.author.avatarUrl}
            alt={post.author.name}
            className="zune-avatar zune-avatar-pulse"
          />
        ) : (
          <span
            className="zune-avatar zune-avatar-pulse"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#0a0a0a",
              fontSize: 20,
            }}
            aria-hidden="true"
          >
            {"\uE77B"}
          </span>
        )}
        <div>
          <div className="zune-user-name">{post.author.name}</div>
          <div className="zune-post-date">{post.createdAt}</div>
        </div>
      </header>

      {post.text ? <p className="zune-post-text">{post.text}</p> : null}

      {post.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt="" className="zune-post-media" />
      ) : null}

      <footer className="zune-post-actions">
        <button
          type="button"
          className="zune-post-action"
          data-active={post.liked ?? false}
          onClick={() => onLike?.(post.id)}
        >
          <span aria-hidden>{"\uEB51"}</span> Нравится{post.likes ? ` ${post.likes}` : ""}
        </button>
        <button
          type="button"
          className="zune-post-action"
          onClick={() => onComment?.(post.id)}
        >
          <span aria-hidden>{"\uE8BD"}</span> Комментировать
          {post.comments ? ` ${post.comments}` : ""}
        </button>
      </footer>
    </article>
  );
}
