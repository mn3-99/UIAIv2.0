import React, { useState } from 'react';
import { ChevronDown, Search, ListTree, Link2 } from 'lucide-react';

interface ReasoningStep {
  step: number;
  title: string;
  detail: string;
}
interface DeepSearchRef {
  num: number;
  title: string;
  url: string;
}

interface DeepSearchPanelProps {
  reasoningSteps?: ReasoningStep[];
  references?: DeepSearchRef[];
}

/**
 * لوحة البحث العميق (Area 2) — تعرض خطوات التفكير (Reasoning Steps) كقائمة
 * قابلة للطي، والمراجع التفاعلية المرقّمة [1] [2] كبطاقات قابلة للنقر.
 */
export const DeepSearchPanel: React.FC<DeepSearchPanelProps> = ({ reasoningSteps, references }) => {
  const [open, setOpen] = useState(false);
  if ((!reasoningSteps?.length) && (!references?.length)) return null;

  return (
    <div className="mb-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 overflow-hidden" dir="rtl">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5" />
          بحث عميق تكيّفي
          {references?.length ? <span className="text-[10px] text-slate-400">· {references.length} مرجع</span> : null}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 animate-in fade-in duration-200">
          {reasoningSteps?.length ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                <ListTree className="w-3 h-3" /> خطوات التفكير
              </div>
              <ol className="space-y-1.5">
                {reasoningSteps.map((s) => (
                  <li key={s.step} className="flex gap-2">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                      {s.step}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-700">{s.title}</div>
                      <div className="text-[10.5px] text-slate-500 leading-relaxed">{s.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {references?.length ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                <Link2 className="w-3 h-3" /> المراجع
              </div>
              <div className="flex flex-wrap gap-1.5">
                {references.map((r) => (
                  <a
                    key={r.num}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={r.title}
                    className="max-w-[240px] truncate text-[10px] px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  >
                    [{r.num}] {r.title || (r.url ? new URL(r.url).hostname : 'مرجع')}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
