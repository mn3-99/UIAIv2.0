import React from 'react';

/**
 * خطوات التفكير المرئية — بنمط Kimi/MiniMax:
 * خطوات صغيرة تظهر داخل فقاعة الرد أمام المستخدم أثناء التوليد،
 * كل خطوة تُعلَّم: نشطة (سبينر) أو مكتملة (✓).
 * الحالة تُشتق من دورة حياة الرسالة الفعلية — لا توقيتات وهمية.
 */

export type StepPhase = 'queued' | 'thinking' | 'streaming';

interface ThinkingStepsProps {
  status?: string;
  hasThinkingText?: boolean;
  hasContent?: boolean;
}

interface StepDef {
  id: string;
  label: string;
}

const STEPS: StepDef[] = [
  { id: 'understand', label: 'فهم الطلب وتحليل القصد' },
  { id: 'reason', label: 'الاستدلال العميق' },
  { id: 'write', label: 'صياغة الرد' },
];

function stepState(stepIdx: number, status?: string, hasThinkingText?: boolean, hasContent?: boolean): 'pending' | 'active' | 'done' {
  const s = status || 'thinking';
  if (s === 'queued') return stepIdx === 0 ? 'active' : 'pending';
  if (s === 'thinking') {
    if (stepIdx === 0) return 'done';
    if (stepIdx === 1) return 'active';
    return 'pending';
  }
  // streaming / responding — الفهم والاستدلال اكتملا، والكتابة نشطة
  if (stepIdx <= 1) return 'done';
  return 'active';
}

export const ThinkingSteps: React.FC<ThinkingStepsProps> = ({ status, hasThinkingText, hasContent }) => {
  // لا خطوات بعد اكتمال المحتوى المرئي — الرد نفسه هو النتيجة
  if (status === 'complete' || status === 'error') return null;

  return (
    <div className="thinking-steps" dir="rtl" aria-live="polite">
      {STEPS.map((step, i) => {
        const st = stepState(i, status, hasThinkingText, hasContent);
        const label = step.id === 'reason' && hasThinkingText ? 'الاستدلال العميق (تفكير مرئي)' : step.label;
        return (
          <div
            key={step.id}
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
            <span className={st === 'pending' ? 'opacity-40' : ''}>{label}</span>
          </div>
        );
      })}
    </div>
  );
};
