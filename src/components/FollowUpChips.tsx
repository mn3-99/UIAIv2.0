import React from 'react';
import { Sparkles } from 'lucide-react';

interface FollowUpChipsProps {
  chips: string[];
  onPick: (chip: string) => void;
}

/** Heuristic follow-up question chips shown under the last completed answer. */
export const FollowUpChips: React.FC<FollowUpChipsProps> = React.memo(({ chips, onPick }) => {
  if (chips.length === 0) return null;
  return (
    <div className="w-full flex flex-col items-center gap-1.5 pt-1">
      <span className="text-[10px] font-bold text-faint flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> تابع الحوار
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {chips.map((chip, i) => (
          <button
            key={`${chip}-${i}`}
            onClick={() => onPick(chip)}
            className="flex items-center min-h-[44px] px-3.5 py-2 rounded-2xl text-[12px] font-medium bg-surface/80 hover:bg-surface border border-line/80 hover:border-accent/35 text-muted hover:text-accent shadow-sm hover:shadow transition-all active:scale-[0.97]"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
});
