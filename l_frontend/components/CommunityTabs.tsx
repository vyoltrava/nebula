"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { Megaphone, MessagesSquare, ArrowLeft } from "lucide-react";

export function CommunityTabs() {
  const { t } = useI18n();
  const pathname = usePathname() || "";

  const tabs = [
    {
      href: "/updates",
      label: t("community.tabUpdates"),
      short: t("community.tabUpdates"),
      icon: Megaphone,
      active: pathname.startsWith("/updates"),
    },
    {
      href: "/suggestions",
      label: t("community.tabForum"),
      short: t("community.tabForumShort"),
      icon: MessagesSquare,
      active: pathname.startsWith("/suggestions"),
    },
  ];

  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-2 mb-6 bg-paper dark:bg-[#171717]/90 backdrop-blur-md flex items-center gap-1 sm:static sm:z-auto sm:mx-0 sm:px-0 sm:py-0 sm:mb-8 sm:bg-transparent sm:backdrop-blur-none">
      {/* Назад вЂ” чисто стрелка */}
      <Link
        href="/"
        title={t("common.back")}
        className="p-2.5 -ml-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 active:scale-95 transition-all shrink-0"
      >
        <ArrowLeft size={20} />
      </Link>

      {/* Табы без пузыря: на мобиле вЂ” на всю ширину, на десктопе вЂ” компакт */}
      <div className="flex flex-1 gap-1 min-w-0">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-2 px-3 sm:px-4 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-[0.98] min-w-0 ${
              tab.active
                ? "bg-[#8b5cf6]/15 text-[#a78bfa]"
                : "text-gray-500 dark:text-white/40 hover:bg-white/[0.03] hover:text-gray-600 dark:hover:text-white/60"
            }`}
          >
            <tab.icon size={16} className={`shrink-0 ${tab.active ? "text-[#8b5cf6]" : ""}`} />
            {/* Мобила вЂ” короткая подпись, десктоп вЂ” полная */}
            <span className="truncate sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline truncate">{tab.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}