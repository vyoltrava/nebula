"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress, MetricBar } from "@/components/ui/progress";
import { CloseButton } from "@/components/ui/CloseButton";
import { Avatar } from "@/components/Avatar";
import { Recommendation } from "@/app/recommendations/[userId]/page";

export function RecommendationDetailsModal({
  rec,
  open,
  onClose,
  t,
}: {
  rec: Recommendation | null;
  open: boolean;
  onClose: () => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}) {
  if (!rec) return null;
  const { user, similarity } = rec;
  const metrics = similarity.metrics;
  const colors = similarity.metric_colors;
  const score = similarity.similarity_score;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-paper dark:bg-[#1a1a1e] border border-line dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">✏️ {t("recommendations.detailTitle")}</h2>
          <CloseButton onClick={onClose} />
        </div>

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Avatar src={user.avatar_url} name={user.display_name || user.username} size={60} />
          <div>
            <h3 className="text-2xl font-bold">{user.display_name}</h3>
            <p className="text-muted-foreground">@{user.username}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm bg-[#8b5cf6]/10 text-[#8b5cf6] px-2 py-1 rounded-full">
                {t("recommendations.similarityScore", { score: Math.round(score) })}
              </span>
              {user.is_verified && (
                <span className="text-xs bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                  ✓ {t("recommendations.verified")}
                </span>
              )}
            </div>
          </div>
        </div>

        {user.bio && <p className="mb-4">{user.bio}</p>}

        {/* Метрики */}
        <div className="space-y-3 mb-6">
          <h3 className="font-semibold">{t("recommendations.analysisTitle")}</h3>
          {Object.entries(metrics).map(([key, value]) => (
            <MetricBar
              key={key}
              label={t(`recommendations.metric_${key}`)}
              value={value}
              color={colors[key] || "#8b5cf6"}
            />
          ))}
        </div>

        {/* Общие интересы */}
        {similarity.common_interests?.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">{t("recommendations.commonInterests")}</h3>
            <div className="flex flex-wrap gap-2">
              {similarity.common_interests.map(tag => (
                <span key={tag} className="bg-secondary px-3 py-1 rounded-full text-sm">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Общие подписчики */}
        {similarity.mutual_friends > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">
              {t("recommendations.mutualFriends", { count: similarity.mutual_friends })}
            </h3>
            <div className="flex gap-1 flex-wrap">
              {similarity.mutual_friends_avatars.map((av, i) => (
                <Avatar key={i} src={av} name="?" size={32} />
              ))}
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => window.location.href = `/user/${user.id}`}
            className="px-4 py-2 rounded-lg bg-[#8b5cf6] text-white font-medium hover:bg-[#774dc9]"
          >
            {t("recommendations.viewProfile")}
          </button>
          <button
            onClick={() => window.location.href = `/messages/${user.id}`}
            className="px-4 py-2 rounded-lg border border-line dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5"
          >
            {t("recommendations.writeMessage")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
