import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@noble/curves", "@noble/ciphers"],

  async rewrites() {
    return {
      afterFiles: [
        {
          // Любой путь на корне (кроме существующих страниц) → в профиль
          source: "/:username",
          destination: "/user/:username",
        },
      ],
    };
  },
};

export default nextConfig;