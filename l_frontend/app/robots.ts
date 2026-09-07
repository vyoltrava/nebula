import type { MetadataRoute } from "next";

// 🤖 SEO: robots.txt — индексируем только публичные страницы, всё приватное — в disallow
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://trelod.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/post", "/prisme", "/channel", "/user", "/rules"],
        disallow: [
          "/admin",
          "/adminnew",
          "/owner-panel",
          "/settings",
          "/nebula-settings",
          "/messages",
          "/notifications",
          "/bookmarks",
          "/stat",
          "/api/",
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
