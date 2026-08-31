"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Filter } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useI18n } from "@/lib/i18n/LanguageProvider";
import { RecommendationGraph } from "@/components/RecommendationGraph";
import { RecommendationFilters } from "@/components/RecommendationFilters";
import { RecommendationDetailsModal } from "@/components/RecommendationDetailsModal";

export type RecUser = {
  id: number;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  bio?: string | null;
  is_verified: boolean;
  custom_badge_url?: string | null;
};

export type Recommendation = {
  user: RecUser;
  similarity: {
    similarity_score: number;
    metrics: Record<string, number>;
    common_interests: string[];
    mutual_friends: number;
    mutual_friends_avatars: string[];
    metric_colors: Record<string, string>;
  };
};

export default function RecommendationsPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const userId = Number(params.userId || 0);
  const [center, setCenter] = useState<RecUser | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "tags" | "activity">("all");
  const [active, setActive] = useState<Recommendation | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/api/users/${userId}/recommendations?min_similarity=20&limit=24`);
        const data = await res.json();
        if (!cancelled) {
          setCenter(data.center_user);
          setItems(data.recommendations || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (userId) load();
    return () => { cancelled = true; };
  }, [userId]);

  const filtered = useMemo(() => {
    return items.filter(r => {
      if (filter === "tags") return (r.similarity.common_interests.length || 0) >= 2;
      if (filter === "activity") return (r.similarity.metrics.activity || 0) >= 40;
      return true;
    });
  }, [items, filter]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto border-x border-line dark:border-white/10 bg-paper dark:bg-[#0d0d0f]">
        <header className="p-4 border-b border-line dark:border-white/10 flex items-center gap-3">
          <div className="w-9 h-9 bg-gray-200 dark:bg-white/10 rounded animate-pulse" />
          <div className="h-5 w-48 bg-gray-200 dark:bg-white/10 rounded animate-pulse" />
        </header>
        <RecommendationGraph
          centerUser={{ id: 0, display_name: "…", avatar_url: "" }}
          recommendations={[]} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto border-x border-line dark:border-white/10 bg-paper dark:bg-[#0d0d0f]">
      <header className="px-4 py-3 border-b border-line dark:border-white/10 flex items-center justify-between bg-paper dark:bg-[#0d0d0f] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-1.5 rounded-lg text-gray-600 dark:text-white/60 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label={t("common.back")}
          >
            <ArrowLeft size={20} />
          </button>
          <span className="font-medium text-gray-900 dark:text-white/70 text-sm truncate max-w-[180px]">
            {center?.display_name || ""}
          </span>
        </div>
        <RecommendationFilters value={filter} onChange={v => setFilter(v)} />
      </header>

      <main className="relative w-full h-[calc(100vh-56px)] overflow-hidden">
        <RecommendationGraph
          centerUser={center || { id: 0, display_name: "", avatar_url: "" }}
          recommendations={filtered}
          onCardClick={setActive}
        />
      </main>

      <RecommendationDetailsModal
        rec={active}
        open={!!active}
        onClose={() => setActive(null)}
        t={t}
      />
    </div>
  );
}

