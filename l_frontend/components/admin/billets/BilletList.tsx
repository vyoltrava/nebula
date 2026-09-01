"use client";

import { BilletData } from "@/types/billet"; 

interface BilletListProps {
  billets: BilletData[];
  loading: boolean;
  onEdit: (billet: BilletData) => void;
  onDelete: (billetId: number) => void;
  onAssign: (billet: BilletData) => void;
}

export function BilletList({ billets, loading, onEdit, onDelete, onAssign }: BilletListProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 bg-ivory dark:bg-[#1a1a1a] rounded-xl border border-line dark:border-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (billets.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-2">рџЏ·пёЏ</div>
        <p>РќРµС‚ СЃРѕР·РґР°РЅРЅС‹С… РїР»Р°С€РµРє</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {billets.map((billet) => (
        <div key={billet.id} className="bg-paper dark:bg-[#171717] border border-line dark:border-white/10 rounded-xl p-4 hover:border-gray-200 dark:hover:border-white/20 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {billet.icon_url && (
                <img src={billet.icon_url} alt="" className="w-5 h-5 rounded" />
              )}
              <span className="font-medium text-sm">{billet.name}</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              billet.is_active ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-gray-500/20 text-gray-400"
            }`}>
              {billet.is_active ? "РђРєС‚РёРІРЅР°" : "РЎРєСЂС‹С‚Р°"}
            </span>
          </div>

          {billet.description && (
            <p className="text-xs text-gray-400 mb-3 line-clamp-2">{billet.description}</p>
          )}

          <div className="flex gap-1">
            <button
              onClick={() => onAssign(billet)}
              className="flex-1 px-2 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-600 dark:text-blue-400 rounded"
            >
              Р’С‹РґР°С‚СЊ
            </button>
            <button
              onClick={() => onEdit(billet)}
              className="px-2 py-1.5 text-xs bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded"
            >
              вњЏпёЏ
            </button>
            <button
              onClick={() => onDelete(billet.id)}
              className="px-2 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 rounded"
            >
              рџ—‘пёЏ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
