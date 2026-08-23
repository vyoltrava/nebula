"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Megaphone, MessagesSquare, ArrowLeft } from "lucide-react";

export function CommunityTabs() {
  const { t } = useI18n();
  const pathname = usePathname() || "";

  const tabs = [
    { href: "/updates",     label: t("community.tabUpdates"), icon: Megaphone,      active: pathname.startsWith("/updates") },
    { href: "/suggestions", label: t("community.tabForum"),   icon: MessagesSquare, active: pathname.startsWith("/suggestions") },
  ];

  return (
    <div className="flex items-center gap-2 mb-8">
      {/* Кнопка "Назад" — только стрелка, как в сайдбаре */}
      <Link
        href="/"
        className="p-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all shrink-0"
        title={t("common.back")}
      >
        <ArrowLeft size={18} />
      </Link>

      {/* Табы — стиль как у активных пунктов сайдбара (classic) */}
      <div className="flex gap-1 p-1 bg-white/5 border border-white/10 rounded-xl">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab.active
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-white/40 hover:bg-white/[0.03] hover:text-white/60"
            }`}
          >
            <tab.icon size={16} className={tab.active ? "text-[#8b5cf6]" : ""} />
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}