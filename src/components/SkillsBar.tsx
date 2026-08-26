import React, { useMemo } from 'react';
import {
  Languages, ListMinus, Code2, Microscope, Presentation, FileText, Table, Wand2,
  Globe, ImageIcon, Volume2, Link, FolderOpen, Brain, Sparkles, Plus
} from 'lucide-react';
import type { SkillDefinition } from '../utils/skillsRegistry';

export const SKILL_ICONS: Record<string, React.ComponentType<any>> = {
  Languages, ListMinus, Code2, Microscope, Presentation, FileText, Table, Wand2,
  Globe, ImageIcon, Volume2, Link, FolderOpen, Brain, Sparkles,
};

interface SkillsBarProps {
  registry: SkillDefinition[];
  onToggleSkill: (id: string) => void;
  onTriggerPlugin: (action: string) => void;
  onOpenManager: () => void;
}

/**
 * الشريط السفلي للمهارات والإضافات — أسفل حقل الكتابة.
 * يعرض أول 4 عناصر مفعّلة كوصول سريع + زر "المزيد" لصفحة الإدارة الكاملة.
 * خفيف: لا طلبات شبكة — القراءة من localStorage عبر السجل فقط.
 */
export const SkillsBar: React.FC<SkillsBarProps> = ({ registry, onToggleSkill, onTriggerPlugin, onOpenManager }) => {
  const quickItems = useMemo(
    () => registry.filter(item => item.enabled && item.reliable).slice(0, 4),
    [registry]
  );
  const activeCount = useMemo(
    () => registry.filter(item => item.enabled).length,
    [registry]
  );

  return (
    <div className="flex items-center gap-1.5 mt-1.5 px-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }} dir="rtl">
      {quickItems.map(item => {
        const Icon = SKILL_ICONS[item.icon] || Sparkles;
        const isPlugin = item.type === 'plugin';
        return (
          <button
            key={item.id}
            onClick={() => isPlugin ? onTriggerPlugin(item.action!) : onToggleSkill(item.id)}
            title={`${item.name} — ${item.desc}`}
            className="shrink-0 h-7 px-2 rounded-full flex items-center gap-1.5 text-[11px] font-semibold transition-all duration-200 border bg-indigo-50/70 text-indigo-700 border-indigo-200/60 hover:bg-indigo-100 hover:scale-[1.03] active:scale-95"
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
            <span className="whitespace-nowrap">{item.name}</span>
            {isPlugin && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          </button>
        );
      })}

      <button
        onClick={onOpenManager}
        title="إدارة المهارات والإضافات"
        className="shrink-0 h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition-all duration-200 border bg-slate-50 text-slate-600 border-slate-200/70 hover:bg-slate-100 hover:text-slate-800 hover:scale-[1.03] active:scale-95 mr-auto"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
        <span>المزيد</span>
        {activeCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
};
