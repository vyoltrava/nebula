import { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<>"')]+/g;

export function cleanUrl(u: string): string {
  return u.replace(/[.,;:!?]+$/, "");
}

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map(cleanUrl);
}

export function renderWithLinks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const raw = m[0];
    const url = cleanUrl(raw);
    out.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
         className="break-all text-sky-400 hover:underline">
        {url}
      </a>
    );
    last = i + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}