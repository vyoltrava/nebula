"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clearNotifsCache } from "@/lib/notifsCache";

export function TransientCacheReset() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      clearNotifsCache();
      previousPathname.current = pathname;
    }
  }, [pathname]);

  return null;
}
