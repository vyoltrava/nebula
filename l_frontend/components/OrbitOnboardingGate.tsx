"use client";

import OrbitOnboarding from "@/components/OrbitOnboarding";

/* Клиентская обёртка: позволяет монтировать OrbitOnboarding из
   Server Component layout без `dynamic({ ssr: false })`,
   который в App Router запрещён. */
export default function OrbitOnboardingGate() {
  return <OrbitOnboarding />;
}
