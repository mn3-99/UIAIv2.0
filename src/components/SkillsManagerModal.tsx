import React, { useMemo, useState } from 'react';
import { X, Search, Wand2, Loader2, Trash2, Sparkles } from 'lucide-react';
import type { SkillDefinition } from '../utils/skillsRegistry';
import { REJECTED_IMPORTS, removeGeneratedSkill, addGeneratedSkill } from '../utils/skillsRegistry';
import { SKILL_ICONS } from './SkillsBar';

interface SkillsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  registry: SkillDefinition[];
  onToggleSkill: (id: string) => void;
  onRegistryChanged: () => void;
}

/**
 * صفحة إدارة المهارات والإضافات — تبويبات (مهارات/إضافات) بنمط Kimi:
 * بحث فوري، تصنيف، مفاتيح تفعيل، وصانع مهارات مدمج في أعلى تبويب المهارات.
 */
export const SkillsManagerModal: React.FC<SkillsManagerModalProps> = ({
  isOpen, onClose, registry, onToggleSkill, onRegistryChanged
}) => {
  const [tab, setTab] = useState<'skills' | 'plugins'>('skills');
  const [query, setQuery] = useState('');
  const [builderInput, setBuilderInput] = useState('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    return registry.filter(item => {
      if (tab === 'skills' && item.type !== 'skill') return false;
      if (tab === 'plugins' && item.type !== 'plugin') return false;
      if (!q) return true;
      return item.name.includes(q) || item.nameEn.toLowerCase().includes(q.toLowerCase()) || item.desc.includes(q);
    });
  }, [registry, tab, query]);

  const categories = useMemo(() => {
    const map = new Map<string, SkillDefinition[]>();
    for (const item of filtered) {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleBuildSkill = async () => {
    const desc = builderInput.trim();
    if (desc.length < 3 || isBuilding) return;
    setIsBuilding(true);
    setBuilderError('');
    try {
      const res = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `فشل التوليد (${res.status})`);
      }
      addGeneratedSkill(data.skill);
      setBuilderInput('');
      onRegistryChanged();
    } catch (err: any) {
      setBuilderError(err.message || 'فشل توليد المهارة');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleRemoveGenerated = async (id: string) => {
    removeGeneratedSkill(id);
    onRegistryChanged();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">المهارات والإضافات</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Tabs — نمط Kimi */}
        <div className="flex gap-1 px-5 pt-3">
          {([['skills', 'المهارات'], ['plugins', 'الإضافات']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                tab === key ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث..."
              className="h-8 w-36 pr-8 pl-3 rounded-full bg-slate-100 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300 transition-all"
            />
          </div>
        </div>

        {/* Skill Builder — داخل تبويب المهارات */}
        {tab === 'skills' && (
          <div className="mx-5 mt-3 p-3 rounded-2xl bg-gradient-to-l from-indigo-50 to-purple-50 border border-indigo-100">
            <div className="flex items-center gap-2 mb-2">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-800">صانع المهارات — صف بكلمات موجزة واحصل على مهارة كاملة</span>
            </div>
            <div className="flex gap-2">
              <input
                value={builderInput}
                onChange={(e) => setBuilderInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleBuildSkill()}
                placeholder="مثال: مهارة تحليل المشاعر من النصوص..."
                disabled={isBuilding}
                className="flex-1 h-9 px-3 rounded-xl bg-white text-xs text-slate-700 outline-none border border-indigo-100 focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
              />
              <button
                onClick={handleBuildSkill}
                disabled={isBuilding || builderInput.trim().length < 3}
                className="h-9 px-4 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-all flex items-center gap-1.5 active:scale-95"
              >
                {isBuilding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                توليد
              </button>
            </div>
            {builderError && <p className="text-[11px] text-rose-600 mt-1.5 font-semibold">{builderError}</p>}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {categories.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-8">لا نتائج مطابقة</p>
          )}
          {categories.map(([category, items]) => (
            <div key={category}>
              <h3 className="text-[11px] font-bold text-slate-400 mb-2">{category}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {items.map(item => {
                  const Icon = SKILL_ICONS[item.icon] || Sparkles;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all duration-200 ${
                        item.enabled ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-150 bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          item.enabled ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          <Icon className="w-4 h-4" strokeWidth={2.2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-800 truncate">{item.name}</span>
                            {item.source === 'generated' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold shrink-0">مولّدة</span>
                            )}
                            {!item.reliable && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold shrink-0">غير موثوقة</span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">{item.desc}</p>
                        </div>
                        {/* Toggle switch */}
                        <button
                          onClick={() => onToggleSkill(item.id)}
                          role="switch"
                          aria-checked={item.enabled}
                          className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 mt-1 ${
                            item.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                            item.enabled ? 'right-0.5' : 'right-4'
                          }}`} />
                        </button>
                      </div>
                      {item.source === 'generated' && (
                        <button
                          onClick={() => handleRemoveGenerated(item.id)}
                          className="mt-2 flex items-center gap-1 text-[10px] text-rose-500 hover:text-rose-700 font-semibold transition-colors"
                        >
                          <Trash2 className="w-3 h-3" /> حذف المهارة
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* الاستيرادات المرفوضة — شفافية موثقة */}
          {tab === 'plugins' && (
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowRejected(v => !v)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showRejected ? '▼' : '◀'} إضافات Kimi غير المستوردة ({REJECTED_IMPORTS.length}) — مع الأسباب
              </button>
              {showRejected && (
                <div className="mt-2 space-y-1.5">
                  {REJECTED_IMPORTS.map((r, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-50 border border-slate-150 border-slate-200/60">
                      <div className="text-[11px] font-bold text-slate-600">{r.name} <span className="text-slate-400 font-normal">({r.category})</span></div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{r.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
