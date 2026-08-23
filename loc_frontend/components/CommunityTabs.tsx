"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Megaphone, MessagesSquare } from "lucide-react";

export function CommunityTabs() {
  const { t } = useI18n();
  const pathname = usePathname() || "";

  const tabs = [
    { href: "/updates", label: t("community.tabUpdates"), icon: Megaphone, active: pathname.startsWith("/updates") },
    { href: "/suggestions", label: t("community.tabForum"), icon: MessagesSquare, active: pathname.startsWith("/suggestions") },
  ];

  return (
    <div className="flex gap-1 p-1 mb-8 w-fit bg-white/5 border border-white/10 rounded-xl">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            tab.active ? "bg-[#8b5cf6] text-white" : "text-white/60 hover:text-white hover:bg-white/5"
          }`}
        >
          <tab.icon size={16} />
          {tab.label}
        </Link>
      ))}
    </div>
  );
}