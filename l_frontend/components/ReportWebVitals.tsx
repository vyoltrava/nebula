"use client";

// 📊 PERF: мониторинг Web Vitals — отправляем метрики в Sentry (если он подключён на клиенте).
import { useReportWebVitals } from "next/web-vitals";

export function ReportWebVitals() {
  useReportWebVitals((metric) => {
    let sentry: any = null;
    if (typeof window !== "undefined") sentry = (window as any).Sentry;
    if (sentry) {
      sentry.captureMessage("web-vital", {
        extra: { name: metric.name, value: metric.value, rating: metric.rating },
      });
    }
  });
  return null;
}