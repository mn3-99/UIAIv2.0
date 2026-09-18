import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RichMarkdown } from './RichMarkdown';
import { MarkdownBoundary } from './MarkdownBoundary';
import { ReadingModePane } from './ReadingModePane';

// ─────────────────────────────────────────────────────────────────────────────
// AgentPipelineView — Unified streaming thinking pipeline
//
// Replaces ReasoningStream + ExecutionSteps with a single flow:
//   queued → parsing steps → spinner per step → ✓ when done → final answer
//
// Proven patterns:
//   1. Each thinking round does ONE thing → single line item
//   2. State layer = working memory (overwritten each round) + long-term todo
//   3. Relay baton = next read current state, continue from where last left off
//   4. Visual: dim/small during thinking, spinning circle active, green ✓ done
//   5. FINAL ANSWER ONLY after ALL steps complete
// ─────────────────────────────────────────────────────────────────────────────

export interface AgentPipelineViewProps {
  status: 'queued' | 'thinking' | 'streaming' | 'responding' | 'complete' | 'error' | 'pending';
  thinking?: string;
  contentStr: string;
  searchCount: number;
  thinkChars: number;
  caretMode?: 'block' | 'pulse' | 'none';
  /** Python execution results rendered as source blocks. */
  pyResults?: string[];
}

interface ParsedStep {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'done';
}

/**
 * Parse raw thinking into logical one-line steps (~70 chars each).
 * Strips <thinking> tags, splits on sentence boundaries.
 */
function parseThinkingSteps(raw: string): ParsedStep[] {
  if (!raw?.trim()) return [];

  // Strip <thinking> tags if present
  let content = raw;
  const tagMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (tagMatch) content = tagMatch[1];

  const chunks: string[] = [];
  const sentences = content.match(/[^.!?؟\n]+[.!?؟]?/g) || [content];
  let accumulator = '';

  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    if ((accumulator.length + trimmed.length) > 70) {
      if (accumulator.trim()) chunks.push(accumulator.trim());
      accumulator = s;
    } else {
      accumulator += s;
    }
  }
  if (accumulator.trim() && !chunks.includes(accumulator.trim())) {
    chunks.push(accumulator.trim());
  }

  return chunks.map((text, i) => ({
    id: `step-${i}-${text.slice(0, 16).replace(/\s+/g, '-')}`,
    title: text.length > 60 ? `${text.substring(0, 60)}…` : text,
    status: 'pending' as const,
  }));
}

/** 12×12 SVG spinning circle used per step. */
function PipelineSpinner(): React.ReactElement {
  return (
    <svg
      className="pipeline-spin-svg"
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="6"
        cy="6"
        r="4"
        stroke="#565F89"
        strokeWidth="2"
        strokeLinecap="round"
        style={{
          animation: 'pipeline-rotate 1s linear infinite',
        }}
      />
    </svg>
  );
}

/** Green checkmark for completed steps. */
function PipelineCheck(): React.ReactElement {
  return (
    <span
      className="pipeline-step-done"
      aria-hidden="true"
      style={{ color: '#9ECE6A', fontSize: 14, fontWeight: 'bold' }}
    >
      ✓
    </span>
  );
}

export const AgentPipelineView: React.FC<AgentPipelineViewProps> = React.memo(({
  status,
  thinking,
  contentStr,
  searchCount,
  thinkChars,
  caretMode = 'block',
  pyResults,
}) => {
  const parsedSteps = useMemo(() => parseThinkingSteps(thinking ?? ''), [thinking]);

  // Step statuses evolve over time during thinking phase
  const [stepStatuses, setStepStatuses] = useState<Map<string, 'pending' | 'active' | 'done'>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [hasRevealedAnswer, setHasRevealedAnswer] = useState(false);
  const [readingMode, setReadingMode] = useState(false);

  // Initialize step states when parsedSteps change (new message)
  useEffect(() => {
    setStepStatuses(new Map(parsedSteps.map((s, i) => [
      s.id,
      i === 0 && parsedSteps.length > 0 ? 'active' : 'pending',
    ])));
    setShowAnswer(false);
    setHasRevealedAnswer(false);
    setReadingMode(false);
  }, [parsedSteps]);

  // Transition steps: active step completes → next becomes active
  // ~1s gap between completion of each step
  useEffect(() => {
    if (status !== 'thinking' || parsedSteps.length === 0) return;

    let cancelled = false;

    const tickSteps = () => {
      if (cancelled) return;

      setStepStatuses((prev) => {
        const arr = Array.from(prev.entries());
        const activeIndex = arr.findIndex(([, st]) => st === 'active');
        if (activeIndex === -1) return prev;

        const newMap = new Map(arr);
        const currentId = arr[activeIndex][0];
        newMap.set(currentId, 'done');

        // Next step becomes active
        if (activeIndex < arr.length - 1) {
          const nextId = arr[activeIndex + 1][0];
          newMap.set(nextId, 'active');
        }

        return newMap;
      });

      timerRef.current = setTimeout(tickSteps, 1000);
    };

    const activeIdx = parsedSteps.findIndex((s) => stepStatuses.get(s.id) === 'active');
    if (activeIdx >= 0) {
      timerRef.current = setTimeout(tickSteps, 1000);
    }

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, parsedSteps.length]);

  // When thinking stops or we go to streaming → mark all remaining as done
  const handlePhaseTransition = () => {
    setStepStatuses((prev) => {
      const newMap = new Map(prev);
      parsedSteps.forEach((s) => {
        if (newMap.get(s.id) !== 'done') newMap.set(s.id, 'done');
      });
      return newMap;
    });

    setHasRevealedAnswer((had) => {
      if (had) return true;
      const t = setTimeout(() => setShowAnswer(true), 400);
      return true;
    });
  };

  useEffect(() => {
    if (status === 'streaming' || status === 'responding' || status === 'complete') {
      handlePhaseTransition();
    }
  }, [status]);

  const isFinalPhase = status === 'complete';
  const isInProgress = ['thinking', 'streaming', 'responding'].includes(status);
  const isQueued = status === 'queued';
  const allDone = parsedSteps.every((s) => stepStatuses.get(s.id) === 'done');
  const shouldShowAnswer = hasRevealedAnswer && contentStr.trim().length > 0;
  const needsReadingMode = shouldShowAnswer && contentStr.length > 1500;

  return (
    <>
      {/* ── Global keyframe styles ── */}
      <style>{`
        @keyframes pipeline-rotate {
          to { transform: rotate(360deg); }
        }
        @keyframes pipeline-pulse-amber {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes pipeline-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pipeline-fade-in {
          animation: pipeline-fade-in 0.4s ease-out forwards;
        }
        .pipeline-step-enter {
          animation: pipeline-fade-in 0.25s ease-out forwards;
        }
      `}</style>

      {/* ════════════════════════════════════════════ */}
      {/* STATE A: Queued                              */}
      {/* ════════════════════════════════════════════ */}
      {isQueued && (
        <div
          dir="rtl"
          className="pipeline-container queued pipeline-fade-in"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#DCFF7E',
              animation: 'pipeline-pulse-amber 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 12, color: '#DCFF7E', fontWeight: 500 }}>
            في الطابور — تنتظر دورها
          </span>
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* STATE B: Thinking / C: Streaming             */}
      {/* Show parsed steps with spinners               */}
      {/* ════════════════════════════════════════════ */}
      {!isFinalPhase && parsedSteps.length > 0 && (
        <ul
          className="pipeline-steps"
          dir="rtl"
          role="log"
          aria-live="polite"
          style={{ margin: 0, padding: 0, listStyle: 'none' }}
        >
          {parsedSteps.map((step, idx) => {
            const st = stepStatuses.get(step.id) ?? 'pending';
            const isActive = st === 'active';
            const isDoneVal = st === 'done';
            const isNewlyShown = idx > 0 && isActive && isInProgress;

            return (
              <React.Fragment key={step.id}>
                <li
                  className={`pipeline-step${isNewlyShown ? ' pipeline-step-enter' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '2px 0',
                    minHeight: 20,
                    fontSize: 12,
                  }}
                >
                  {/* Icon column */}
                  <span style={{ flexShrink: 0 }}>
                    {isDoneVal && <PipelineCheck />}
                    {isActive && <PipelineSpinner />}
                    {!isActive && !isDoneVal && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          border: '2px solid #565F89',
                          opacity: 0.25,
                        }}
                      />
                    )}
                  </span>

                  {/* Step title — dimmed during thinking */}
                  <span
                    className={isDoneVal ? 'pipeline-step-done' : ''}
                    style={{
                      opacity: isDoneVal ? 1 : isActive ? 1 : 0.25,
                      transition: 'opacity 0.5s ease',
                      fontSize: 12,
                      lineHeight: 1.4,
                      color: isDoneVal ? '#9ECE6A' : isActive ? '#C4CACE' : '#565F89',
                    }}
                  >
                    {step.title}
                  </span>
                </li>

                {/* Separator between steps: small rotating circle */}
                {idx < parsedSteps.length - 1 && (
                  <li
                    className="pipeline-step-separator"
                    aria-hidden="true"
                    style={{
                      height: 6,
                      marginLeft: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PipelineSpinner />
                  </li>
                )}
              </React.Fragment>
            );
          })}

          {/* Active writing indicator during streaming/responding */}
          {(status === 'streaming' || status === 'responding') && allDone && (
            <>
              <li
                className="pipeline-step pipeline-step-enter"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '3px 0',
                  marginTop: 4,
                }}
              >
                <span style={{ flexShrink: 0 }}>
                  <PipelineSpinner />
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: '#C4CACE',
                    lineHeight: 1.4,
                  }}
                >
                  يحرر الآن ({contentStr.length.toLocaleString('ar-SA')} حرف)
                </span>
              </li>

              {/* Search source chips during streaming */}
              {(searchCount > 0) && (
                <li
                  className="pipeline-search-chip"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    padding: '4px 0',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: '#7B7F99',
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(86,95,137,0.1)',
                    }}
                  >
                    🔍 {searchCount} بحث
                  </span>
                  {thinkChars > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#7B7F99',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(86,95,137,0.1)',
                      }}
                    >
                      🧠 {thinkChars.toLocaleString('en-US')} رمز تفكير
                    </span>
                  )}
                </li>
              )}
            </>
          )}
        </ul>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* STATE D: Complete — FINAL ANSWER ONLY        */}
      {/* ════════════════════════════════════════════ */}
      {shouldShowAnswer && (
        <div className="pipeline-answer pipeline-fade-in">
          {/* Search sources on complete */}
          {(searchCount > 0 || thinkChars > 0) && (
            <div
              dir="ltr"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 12,
                direction: 'rtl',
              }}
            >
              {searchCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: '#7B7F99',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(86,95,137,0.1)',
                  }}
                >
                  🔍 {searchCount} بحث
                </span>
              )}
              {thinkChars > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    color: '#7B7F99',
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(86,95,137,0.1)',
                  }}
                >
                  🧠 {thinkChars.toLocaleString('en-US')} رمز تفكير
                </span>
              )}
            </div>
          )}

          {/* Rich markdown answer wrapped in error boundary */}
          <MarkdownBoundary content={contentStr}>
            <RichMarkdown
              content={contentStr}
              isStreaming={false}
            />
          </MarkdownBoundary>

          {/* Python execution outputs */}
          {pyResults && pyResults.length > 0 && (
            <div
              dir="ltr"
              style={{
                marginTop: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {pyResults.map((result, i) => (
                <pre
                  key={i}
                  style={{
                    fontSize: 12,
                    background: 'rgba(86,95,137,0.06)',
                    border: '1px solid rgba(86,95,137,0.12)',
                    borderRadius: 6,
                    padding: '10px 12px',
                    overflowX: 'auto',
                    fontFamily: "'Plus Jakarta Sans', 'JetBrains Mono', monospace",
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    color: '#C4CACE',
                  }}
                >
                  {result}
                </pre>
              ))}
            </div>
          )}

          {/* Streaming caret indicator */}
          {isInProgress && caretMode !== 'none' && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                marginLeft: 2,
                width: caretMode === 'block' ? 9 : 2,
                height: 15,
                backgroundColor: '#C4CACE',
                opacity: caretMode === 'block' ? 1 : undefined,
                animation: caretMode === 'pulse'
                  ? 'pipeline-pulse-amber 1s ease-in-out infinite'
                  : undefined,
                verticalAlign: 'text-bottom',
              }}
            />
          )}

          {/* Reading mode toggle for long content */}
          {needsReadingMode && !readingMode && (
            <button
              onClick={() => setReadingMode(true)}
              style={{
                marginTop: 12,
                fontSize: 12,
                color: '#7B7F99',
                background: 'rgba(86,95,137,0.08)',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.background = 'rgba(86,95,137,0.15)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'rgba(86,95,137,0.08)';
              }}
            >
              📖 وضع القراءة المريحة
            </button>
          )}

          {needsReadingMode && readingMode && (
            <ReadingModePane
              content={contentStr}
              onClose={() => setReadingMode(false)}
            />
          )}
        </div>
      )}
    </>
  );
});

AgentPipelineView.displayName = 'AgentPipelineView';
export default AgentPipelineView;
