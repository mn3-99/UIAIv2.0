import React from 'react';
import { Search, Brain, PenLine } from 'lucide-react';

/**
 * سلسلة خطوات التنفيذ الحية (نمط Grok/Gemini Spark):
 * تعرض للمستخدم — أثناء التوليد — ما يفعله الموديل الآن كقائمة todo:
 * فهم الطلب → بحث/مصادر → استدلال/تفكير → صياغة الرد.
 * الخطوات مشتقّة من دورة حياة الرسالة الفعلية (queued/thinking/streaming)
 * لا من توقيتات وهمية، فتُعلَّم نشطة (سبينر) أو مكتملة (✓) بشكل حقيقي.
 */

interface ExecutionStepsProps {
  status?: string;
  hasThinking?: boolean;
  contentChars?: number;
  searchCount?: number;
  thinkChars?: number;
}

type RowState = 'done' | 'active' | 'pending';

export const ExecutionSteps: React.FC<ExecutionStepsProps> = React.memo(({
  status, hasThinking, contentChars, searchCount, thinkChars
}) => {
  const s = status || 'queued';
  if (s === 'complete' || s === 'error') return null;

  const phases: { id: string; title: string; Icon: any }[] = [
    { id: 'understand', title: 'فهم الطلب وتحليل القصد', Icon: Brain },
  ];
  if ((searchCount || 0) > 0) {
    phases.push({ id: 'search', title: 'البحث وجمع المصادر', Icon: Search });
  }
  phases.push({ id: 'reason', title: 'الاستدلال والتفكير', Icon: Brain });
  phases.push({ id: 'write', title: 'صياغة الرد وكتابته', Icon: PenLine });

  const n = phases.length;
  // Index (within phases) of the row that is currently running.
  const runIdx = ((): number => {
    if (s === 'queued') return 0;
    if (s === 'thinking') {
      const searchIdx = phases.findIndex(p => p.id === 'search');
      return searchIdx >= 0 ? searchIdx : 1;
    }
    // streaming / responding
    return n - 1;
  })();

  const stateAt = (idx: number): RowState => {
    if (idx < runIdx) return 'done';
    if (idx === runIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="thinking-steps exec-steps" dir="rtl" aria-live="polite">
      {phases.map((ph, i) => {
        const st = stateAt(i);
        const isReason = ph.id === 'reason';
        const isWrite = ph.id === 'write';
        let title = ph.title;
        if (isReason && hasThinking) title = 'الاستدلال العميق (تفكير مرئي)';
        if (isWrite && s === 'streaming' && (contentChars || 0) > 0) {
          title = `يكتب الرد الآن (${(contentChars || 0).toLocaleString('en-US')} حرفاً)`;
        }
        return (
          <div
            key={ph.id}
            className={`thinking-step ${st === 'active' ? 'active' : ''} ${st === 'done' ? 'done' : ''}`}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            {st === 'done' ? (
              <span className="step-check">✓</span>
            ) : st === 'active' ? (
              <span className="step-spinner" />
            ) : (
              <span className="w-3 h-3 rounded-full border-2 border-current opacity-30 inline-block" />
            )}
            <span className={st === 'pending' ? 'opacity-40' : ''}>
              {title}
            </span>
            {isReason && st === 'active' && (thinkChars || 0) > 0 && (
              <span className="text-[10px] ms-auto text-muted shrink-0">
                {(thinkChars || 0).toLocaleString('en-US')} رمزاً
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});

ExecutionSteps.displayName = 'ExecutionSteps';
