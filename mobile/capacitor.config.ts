import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Nebula — конфигурация мобильного приложения.
 * WebView открывает продакшен-фронтенд (Vercel), нативные возможности
 * (камера/микрофон для звонков, пуши) доступны через плагины Capacitor.
 */
const config: CapacitorConfig = {
  appId: 'app.nebula.mobile',
  appName: 'trelod', // 🔥 имя установленного приложения
  webDir: 'www',
  server: {
    // Продакшен-фронтенд. Локальная отладка: закомментируй url и раскомментируй
    // ниже, чтобы грузить локальный next dev с машины разработчика.
    url: 'https://trelod.vercel.app',
    // url: 'http://192.168.1.100:3000',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#18181b',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
