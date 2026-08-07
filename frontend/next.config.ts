import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ... твои существующие настройки
  transpilePackages: ["@noble/curves", "@noble/ciphers"],
};

export default nextConfig;
