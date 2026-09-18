import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Check, Brain, CheckCircle } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// ReasoningStream — عرض خطوات الاستدلال الحية (نمط Grok/Kimi/o1)
//
// أثناء تفكير النموذج تُعرض الخطوات واحدة تلو الأخرى، لكل خطوة دائرة صغيرة
// تدور حتى تكتمل الخطوة فيظهر علامة ✓ ثم تنتقل للخطوة التالية تلقائياً.
// بعد اكتمال كل الخطوات تُعرض الإجابة النهائية فقط.
//
// الخطوات تُشتق من نص التفكير الفعلي القادم بثاً حياً (SSE think events).
// ─────────────────────────────────────────────────────────────────────────────

interface ReasoningStep {
  id: string;
  title: string;
  content: string;
  status: 'pending' | 'active' | 'done';
  progress: number;
}

interface ReasoningStreamProps {
  /** نص التفكير الخام القادم من النموذج */
  thinking: string;
  /** هل النموذج ما زال يفكّر؟ */
  isThinking: boolean;
  /** هل يتم بث الإجابة النهائية؟ */
  isStreaming: boolean;
  /** الإجابة النهائية (تظهر بعد اكتمال الاستدلال) */
  answer?: string;
  /** يُستدعى عند اكتمال الاستدلال وبدء الإجابة */
  onThinkingComplete?: () => void;
}

/**
 * يحوّل نص التفكير الخام إلى خطوات منطقية.
 * يدعم عدة صيغ: الترقيم، النقاط، العناوين، الفقرات، والجمل.
 */
function parseReasoningSteps(thinking: string): ReasoningStep[] {
  if (!thinking?.trim()) return [];

  // إزالة وسوم التفكير إن وُجدت
  const tagMatch = thinking.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const content = (tagMatch ? tagMatch[1] : thinking).trim();

  let rawSteps: string[] = [];

  // 1) خطوات مرقّمة: 1. 2. 3.
  const numbered = content.match(/(?:^|\n)\s*\d+[.)]\s+(.+?)(?=\n\s*\d+[.)]|\n*$)/g);
  if (numbered && numbered.length > 1) {
    rawSteps = numbered.map((s) => s.trim());
  } else {
    // 2) نقاط: - أو * أو •
    const bullets = content.match(/(?:^|\n)\s*[-*•]\s+(.+?)(?=\n\s*[-*•]|\n*$)/g);
    if (bullets && bullets.length > 1) {
      rawSteps = bullets.map((s) => s.trim());
    } else {
      // 3) عناوين: ## أو **نص**
      const headers = content
        .split(/(?:\n\s*#{1,3}\s+|\n\s*\*\*.*?\*\*\s*\n)/)
        .filter((s) => s.trim().length > 10);
      if (headers.length > 1) {
        rawSteps = headers.map((s) => s.trim());
      } else {
        // 4) فقرات (سطران فارغان)
        const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
        if (paragraphs.length > 1) {
          rawSteps = paragraphs.map((p) => p.trim());
        } else {
          // 5) احتياطي: تقسيم إلى جمل ثم تجميعها
          const sentences = content.match(/[^.!?؟\n]+[.!?؟]?/g) || [content];
          const chunks: string[] = [];
          let current = '';
          for (const s of sentences) {
            if ((current + s).length > 120) {
              if (current.trim()) chunks.push(current.trim());
              current = s;
            } else {
              current += s;
            }
          }
          if (current.trim()) chunks.push(current.trim());
          rawSteps = chunks.filter((c) => c.trim().length > 15);
        }
      }
    }
  }

  return rawSteps.map((step, index) => {
    const firstSentence = step.match(/^[^.!?؟]+[.!?؟]?/);
    const title = firstSentence ? firstSentence[0].trim() : step.substring(0, 60).trim();
    const rest = step.replace(firstSentence ? firstSentence[0] : '', '').trim();
    return {
      id: `step-${index}-${title.slice(0, 12)}`,
      title: title || `الخطوة ${index + 1}`,
      content: rest,
      status: 'pending' as const,
      progress: 0,
    };
  });
}

export const ReasoningStream: React.FC<ReasoningStreamProps> = ({
  thinking,
  isThinking,
  isStreaming,
  answer,
  onThinkingComplete,
}) => {
  const [steps, setSteps] = useState<ReasoningStep[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  const animationRef = useRef<number | null>(null);

  // اشتقاق الخطوات من نص التفكير
  const parsedSteps = useMemo(() => parseReasoningSteps(thinking), [thinking]);

  // مزامنة الخطوات المُشتقة مع الحالة
  useEffect(() => {
    if (parsedSteps.length === 0) return;
    setSteps((prev) => {
      const prevById = new Map(prev.map((s) => [s.id, s]));
      return parsedSteps.map((step, index) => {
        const existing = prevById.get(step.id);
        if (existing) return existing;
        return { ...step, status: index === 0 ? 'active' : 'pending', progress: 0 };
      });
    });
  }, [parsedSteps]);

  // تحريك تقدّم الخطوة النشطة ثم الانتقال للتالية
  useEffect(() => {
    if (!isThinking && !isStreaming) return;
    if (steps.length === 0) return;

    const activeIndex = steps.findIndex((s) => s.status !== 'done');
    if (activeIndex === -1) return;
    const active = steps[activeIndex];
    if (active.status === 'pending' && activeIndex > 0) {
      setSteps((prev) =>
        prev.map((s, i) => (i === activeIndex ? { ...s, status: 'active' } : s))
      );
    }

    const tick = () => {
      setSteps((prev) => {
        const idx = prev.findIndex((s) => s.status !== 'done');
        if (idx === -1) return prev;
        const cur = prev[idx];
        if (cur.progress >= 100) {
          const isLast = idx === prev.length - 1;
          if (!isLast) {
            return prev.map((s, i) => {
              if (i === idx) return { ...s, status: 'done', progress: 100 };
              if (i === idx + 1) return { ...s, status: 'active', progress: 0 };
              return s;
            });
          }
          return prev.map((s, i) => (i === idx ? { ...s, status: 'done', progress: 100 } : s));
        }
        // السرعة: خطوة كاملة في ~1.6 ثانية (100 / 1.25 لكل إطار ~16ms)
        const nextProgress = Math.min(100, cur.progress + 1.25);
        return prev.map((s, i) => (i === idx ? { ...s, progress: nextProgress } : s));
      });

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isThinking, isStreaming, steps.length]);

  // عند اكتمال التفكير والبث: أكمل كل الخطوات ثم اعرض الإجابة
  useEffect(() => {
    if (isThinking || isStreaming) return;
    if (steps.length === 0) return;
    const allDone = steps.every((s) => s.status === 'done' && s.progress >= 100);
    if (!allDone) {
      setSteps((prev) => prev.map((s) => ({ ...s, status: 'done', progress: 100 })));
      return;
    }
    if (!showAnswer) {
      const t = setTimeout(() => {
        setShowAnswer(true);
        onThinkingComplete?.();
      }, 400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThinking, isStreaming, steps, showAnswer]);

  // تمرير تلقائي للخطوة النشطة
  useEffect(() => {
    const idx = steps.findIndex((s) => s.status === 'active');
    if (idx >= 0) {
      stepRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [steps]);

  if (!thinking?.trim() && !isThinking && !isStreaming) return null;

  return (
    <div className="rstream" dir="rtl" role="log" aria-live="polite" aria-label="خطوات الاستدلال">
      <ol className="rstream-list">
        {steps.map((step, index) => (
          <li
            key={step.id}
            ref={(el) => { stepRefs.current[index] = el; }}
            className={`rstream-step is-${step.status}`}
          >
            {/* دائرة الحالة: تدور أثناء التنفيذ وتكتمل بعلامة ✓ */}
            <span className="rstream-dot" aria-hidden="true">
              {step.status === 'done' ? (
                <CheckCircle className="rstream-icon" />
              ) : step.status === 'active' ? (
                <>
                  <svg className="rstream-ring" viewBox="0 0 36 36">
                    <circle className="rstream-ring-bg" cx="18" cy="18" r="15" />
                    <circle
                      className="rstream-ring-fg"
                      cx="18"
                      cy="18"
                      r="15"
                      style={{ strokeDashoffset: 94.2 * (1 - step.progress / 100) }}
                    />
                  </svg>
                  <span className="rstream-pulse" />
                </>
              ) : (
                <span className="rstream-dot-pending" />
              )}
            </span>

            {/* عنوان الخطوة ومحتواها */}
            <span className="rstream-body">
              <span className="rstream-title">{step.title}</span>
              {step.content && step.status !== 'pending' && (
                <span className="rstream-detail">{step.content}</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      {/* شريط اكتمال الاستدلال */}
      {steps.length > 0 && steps.every((s) => s.status === 'done') && !isThinking && !isStreaming && (
        <div className="rstream-done" role="status">
          <Check className="rstream-done-icon" />
          <span>اكتمل الاستدلال</span>
        </div>
      )}

      {/* الإجابة النهائية — تظهر فقط بعد انتهاء الاستدلال */}
      {showAnswer && answer && (
        <div className="rstream-answer" role="region" aria-label="الإجابة النهائية">
          <div className="rstream-answer-head">
            <Brain className="rstream-answer-icon" />
            <span>الإجابة النهائية</span>
          </div>
          <div className="rstream-answer-body">{answer}</div>
        </div>
      )}
    </div>
  );
};

ReasoningStream.displayName = 'ReasoningStream';

export default ReasoningStream;