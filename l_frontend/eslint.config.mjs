import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 🔇 console.log/warn запрещены (остаются error и warn в dev-выводе через no-console excludes ниже).
      // В production-бандле console.* дополнительно вырезается через next.config.ts compiler.removeConsole.
      "no-console": ["error", { allow: ["error", "warn"] }],
      "@next/next/no-img-element": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
