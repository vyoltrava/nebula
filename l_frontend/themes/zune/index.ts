/**
 * Точка входа темы «ZUNE» (Windows Phone Metro).
 * Импорты корневого layout.tsx опираются на этот модуль:
 *   import { ZuneThemeProvider } from "@/themes/zune";
 *   import "@/themes/zune/styles/index.css";
 */

export { ZuneThemeProvider } from "./ZuneThemeProvider";
export { useZuneTheme } from "./hooks/useZuneTheme";
export {
  readZunePreference,
  writePreference,
  subscribePreference,
} from "./hooks/useZuneTheme";
export type { ZunePreference, ZuneThemeContextValue } from "./hooks/useZuneTheme";
