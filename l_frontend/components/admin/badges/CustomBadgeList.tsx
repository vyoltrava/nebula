"use client";

import { CustomBadgeData } from "@/types/badge"; 

interface CustomBadgeListProps {
  badges: CustomBadgeData[];
  loading: boolean;
  onEdit: (badge: CustomBadgeData) => void;
  onDelete: (badgeId: number) => void;
  onAssign: (badge: CustomBadgeData) => void;
}

export function CustomBadgeList({ badges, loading, onEdit, onDelete, onAssign }: CustomBadgeListProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 bg-[#1a1a1a] rounded-xl border border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (badges.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-2">🏷️</div>
        <p>Нет созданных плашек</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {badges.map((badge) => (
        <div key={badge.id} className="bg-[#171717] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {badge.icon_url && (
                <img src={badge.icon_url} alt="" className="w-5 h-5 rounded" />
              )}
              <span className="font-medium text-sm">{badge.name}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              badge.is_active ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
            }`}>
              {badge.is_active ? "Активна" : "Скрыта"}
            </span>
          </div>

          {badge.description && (
            <p className="text-xs text-gray-400 mb-3 line-clamp-2">{badge.description}</p>
          )}

          <div className="flex gap-1">
            <button
              onClick={() => onAssign(badge)}
              className="flex-1 px-2 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded"
            >
              Выдать
            </button>
            <button
              onClick={() => onEdit(badge)}
              className="px-2 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete(badge.id)}
              className="px-2 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
