"use client";
import { Headphones } from "lucide-react";
import Link from "next/link";

export function SupportWidget() {
  return (
    <Link
      href="/support"
      className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-[#8b5cf6] hover:bg-[#7c3aed] text-white rounded-full shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      title="Поддержка"
    >
      <Headphones size={24} />
    </Link>
  );
}