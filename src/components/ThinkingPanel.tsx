import React, { useEffect, useRef, useState } from 'react';
import { Brain, ChevronDown, Sparkles, Timer } from 'lucide-react';

interface ThinkingPanelProps {
  thinking: string;
  isThinking: boolean;
  durationMs?: number;
}

const STATUS_LABELS = [
  'يفكّر بعمق…',
  'يحلّل المسألة…',
  'يرتّب الأفكار…',
  'يفحص التفاصيل…',
  'يصوغ خطة الإجابة…'
];

const formatDuration = (ms: number) => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} ث` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} د`;
};

export const ThinkingPanel: React.FC<ThinkingPanelProps> = React.memo(({ thinking, isThinking, durationMs }) => {
  const [expanded, setExpanded] = useState(isThinking);
  const [statusIdx, setStatusIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Rotate status labels while actively thinking
  useEffect(() => {
    if (!isThinking) return;
    const t = setInterval(() => setStatusIdx(i => (i + 1) % STATUS_LABELS.length), 2600);
    return () => clearInterval(t);
  }, [isThinking]);

  // Live timer while thinking
  useEffect(() => {
    if (!isThinking) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 100);
    return () => clearInterval(t);
  }, [isThinking]);

  // Auto-expand while thinking, auto-collapse once the answer starts
  useEffect(() => {
    if (isThinking) setExpanded(true);
    else setExpanded(false);
  }, [isThinking]);

  // Auto-scroll the reasoning body
  useEffect(() => {
    if (expanded && bodyRef.current && isThinking) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [thinking, expanded, isThinking]);

  if (!thinking || !thinking.trim()) return null;

  return (
    <div className="relative mb-3 rounded-2xl overflow-hidden transition-all duration-500"
      style={{ background: 'linear-gradient(120deg, rgba(139,92,246,0.08), rgba(59,130,246,0.06), rgba(16,185,129,0.07))' }}
    >
      {/* Animated gradient border while thinking */}
      {isThinking && (
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            padding: '1px',
            background: 'linear-gradient(90deg,#8b5cf6,#3b82f6,#10b981,#8b5cf6)',
            backgroundSize: '300% 100%',
            animation: 'thinkBorderFlow 3s linear infinite',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude'
          }}
        />
      )}

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        dir="rtl"
        className="relative w-full flex items-center gap-2.5 px-4 py-3 text-right select-none hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
      >
        {/* Pulsing orb */}
        <span className={`relative flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${isThinking ? 'animate-pulse' : ''}`}
          style={{ background: isThinking ? 'linear-gradient(135deg,#8b5cf6,#6366f1)' : 'linear-gradient(135deg,#94a3b8,#64748b)' }}>
          {isThinking
            ? <Sparkles className="w-3.5 h-3.5 text-white" />
            : <Brain className="w-3.5 h-3.5 text-white" />}
        </span>

        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: isThinking ? 'linear-gradient(90deg,#7c3aed,#2563eb)' : 'none', color: isThinking ? undefined : '#475569' }}>
            {isThinking ? STATUS_LABELS[statusIdx] : 'اكتمل التفكير'}
          </span>
          <span className="block text-[10px] text-slate-400 mt-0.5">
            سلسلة الاستدلال · {thinking.trim().split(/\s+/).length} كلمة
          </span>
        </span>

        {(isThinking ? elapsed > 0 : !!durationMs) && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400 shrink-0 px-2 py-0.5 rounded-full bg-slate-100/70">
            <Timer className="w-3 h-3" />
            {formatDuration(isThinking ? elapsed : (durationMs || 0))}
          </span>
        )}

        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-500 ease-in-out"
        style={{ maxHeight: expanded ? 320 : 0, opacity: expanded ? 1 : 0 }}
      >
        <div
          ref={bodyRef}
          dir="auto"
          className="px-4 pb-3 pt-1 overflow-y-auto text-[12.5px] leading-relaxed text-slate-500 whitespace-pre-wrap font-[450]"
          style={{ maxHeight: 260, maskImage: 'linear-gradient(to bottom, transparent, black 14px)' }}
        >
          {thinking}
          {isThinking && <span className="inline-block w-1.5 h-3.5 ms-1 bg-violet-500 animate-pulse rounded-full align-middle" />}
        </div>
      </div>
    </div>
  );
});

ThinkingPanel.displayName = 'ThinkingPanel';
