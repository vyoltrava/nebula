/**
 * Точка входа темы «OLD iOS» (Skeuomorphism).
 * Импорты корневого layout.tsx опираются на этот модуль:
 *   import { IosThemeProvider } from "@/themes/ios";
 *   import "@/themes/ios/styles/index.css";
 */

export { IosThemeProvider } from "./IosThemeProvider";
export { useIosTheme, applyThemeChoice } from "./hooks/useIosTheme";
export { readIosPreference, writeIosPreference } from "./hooks/useIosTheme";
export type { ThemeChoice, IosPreference, IosThemeContextValue } from "./hooks/useIosTheme";
export { IosThemeSelector } from "./components/IosThemeSelector";
export { SettingsThemeInjector } from "./components/SettingsThemeInjector";