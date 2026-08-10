import React from 'react';
import { Sparkles, Code, BookOpen, Compass, Zap } from 'lucide-react';
import { APP_CONFIG } from '../config';

interface EmptyStateProps {
  onSelectPrompt: (promptText: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectPrompt }) => {
  const suggestions = [
    {
      icon: <Code className="w-5 h-5 text-emerald-400" />,
      title: "كتابة وتوضيح الكود",
      description: "اكتب لي كود TypeScript لإنشاء Server-Sent Events (SSE) stream في Express."
    },
    {
      icon: <BookOpen className="w-5 h-5 text-sky-400" />,
      title: "تلخيص وشرح مفاهيم",
      description: "اشرح لي ميزات Cloudflare Workers AI وكيف تعمل النماذج على الحافة Edge."
    },
    {
      icon: <Compass className="w-5 h-5 text-amber-400" />,
      title: "أفكار وتحليل استراتيجي",
      description: "ما هي أفضل ممارسات تصميم واجهات المستخدم عالية الأداء واستجابة RTL؟"
    },
    {
      icon: <Zap className="w-5 h-5 text-purple-400" />,
      title: "كتابة وتنسيق نصوص",
      description: "صغ لي رسالة بريد إلكتروني مهنية باللغتين العربية والإنجليزية لتقديم مشروع."
    }
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto my-auto space-y-8 animate-fade-in">
      {/* Brand logo & title */}
      <div className="space-y-3">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-700/80 p-3 flex items-center justify-center shadow-xl shadow-emerald-950/30 group hover:border-emerald-500/50 transition-all duration-300">
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
            <rect width="100" height="100" rx="20" fill="#0f172a" />
            <path d="M25 65V35L45 50L65 35V65" stroke="#10b981" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="75" cy="40" r="6" fill="#38bdf8" />
            <circle cx="75" cy="60" r="4" fill="#10b981" />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          مرحباً بك في <span className="text-emerald-400">{APP_CONFIG.name}</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
          تطبيق دردشة ويب ذكي، فائق السرعة ويعمل 100% على تقنيات Edge السحابية. اختر اقتراحاً أو ابدأ في تدوين رسالتك.
        </p>
      </div>

      {/* Suggestion Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full text-right">
        {suggestions.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt(item.description)}
            className="group p-4 bg-slate-900/70 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/80 rounded-2xl text-right transition-all duration-200 flex flex-col justify-between space-y-2 active:scale-[0.98]"
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-semibold text-xs text-slate-200 group-hover:text-emerald-300 transition-colors">
                {item.title}
              </span>
              <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800">
                {item.icon}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
              "{item.description}"
            </p>
          </button>
        ))}
      </div>

      {/* Feature Pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-500">
        <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" /> SSE Streaming فوري
        </span>
        <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
          🔒 دعم المفاتيح والمزودات الشخصية
        </span>
        <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
          ⚡ 100% Free Cloudflare Edge Stack
        </span>
      </div>
    </div>
  );
};
