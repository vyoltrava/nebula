import type { MetadataRoute } from "next";

// 🗺 SEO: sitemap.xml для публичных статических маршрутов.
// Динамический контент (посты/каналы/профили) индексируется по мере обхода,
// для полного sitemap добавить выборку популярных ID из API (см. OPTIMIZATION_PLAN.md).
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://trelod.app";
  const now = new Date();
  return ["", "/rules", "/login"].map((path) => ({
    url: `${site}${path}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: path === "" ? 1 : 0.5,
  }));
}
