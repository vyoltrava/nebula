// lib/sanitize.ts
// 🛡️ Централизованная санитизация HTML/SVG перед dangerouslySetInnerHTML.
// Без этого любой серверный/пользовательский HTML/SVG = stored XSS.
import DOMPurify from "isomorphic-dompurify";

const HTML_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "b", "i", "u", "s", "strong", "em",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "a", "img",
    "code", "pre",
    "blockquote",
    "span", "div",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "class"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  USE_PROFILES: { html: true },
};

const SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  // <script>, <foreignObject>, on*-атрибуты вырезаются автоматически
  ADD_TAGS: ["linearGradient", "radialGradient", "stop", "defs", "clipPath"],
  ADD_ATTR: ["viewBox", "preserveAspectRatio", "gradientUnits", "offset", "stop-color", "stop-opacity"],
  ALLOW_DATA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false,
};

/** Санитизация HTML-фрагментов (посты, описания, preview). */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, HTML_CONFIG);
}

/** Санитизация SVG (prism-ландшафты и т.п.). */
export function sanitizeSvg(svg: string): string {
  if (!svg) return "";
  return DOMPurify.sanitize(svg, SVG_CONFIG);
}
