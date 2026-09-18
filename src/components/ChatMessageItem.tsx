import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, RotateCcw, Edit3, User, AlertCircle, Sparkles, TerminalSquare, Globe, Loader2, RefreshCw, FileText, Volume2, Square, Lightbulb, BookOpenText } from 'lucide-react';
import { ChatMessage } from '../types';
import { RichMarkdown } from './RichMarkdown';
import { DeepSearchPanel } from './DeepSearchPanel';
import { AgentPipelineView } from './AgentPipelineView';
import { WaitingLines, GeminiBloom } from './WaitingAnimations';
import { ReadingModePane } from './ReadingModePane';
import { MessageReactions } from './MessageReactions';
import { copyText } from '../utils/clipboard';
import { speakText, stopSpeaking } from '../utils/tts';
import { safeHostname } from '../utils/url';
import { MarkdownBoundary } from './MarkdownBoundary';
import { RenderErrorBoundary } from '../utils/RenderErrorBoundary';
import { toast } from './Toast';

interface PythonRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  timed_out?: boolean;
  duration_ms?: number;
  running?: boolean;
}

interface ChatMessageItemProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEditPrompt?: (messageId: string, newText: string) => void;
  isLastAssistantMessage?: boolean;
  onOpenCanvas?: (code: string, language: string) => void;
  caretMode?: 'block' | 'pulse' | 'none';
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  onRegenerate,
  onEditPrompt,
  isLastAssistantMessage,
  onOpenCanvas,
  caretMode = 'block'
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [pyResults, setPyResults] = useState<Record<number, PythonRunResult>>({});
  const [reactions, setReactions] = useState<Record<string, boolean>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const [readingMode, setReadingMode] = useState(false);

  // Stop any audio this bubble started when it unmounts (chat switch/navigate)
  useEffect(() => {
    return () => {
      if (speakingRef.current) {
        speakingRef.current = false;
        stopSpeaking();
      }
    };
  }, []);

  const handleToggleReadAloud = () => {
    if (isSpeaking) {
      speakingRef.current = false;
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const started = speakText(message.content, () => {
      speakingRef.current = false;
      setIsSpeaking(false);
    });
    if (started) {
      speakingRef.current = true;
      setIsSpeaking(true);
    } else {
      toast.error('القراءة الصوتية غير مدعومة في هذا المتصفح — جرّب Chrome أو Edge');
    }
  };

  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming' || message.status === 'responding';
  const isThinking = message.status === 'thinking';
  const isQueued = message.status === 'queued';
  const isThinkingActive = (isStreaming || isThinking) && !!message.thinking && message.content.length === 0;
  const isReadable = !isUser && !isError && message.status === 'complete'
    && typeof message.content === 'string' && message.content.length > 1500;
  const contentStr = typeof message.content === 'string' ? message.content : '';
  // Strip thinking tags from content — thinking goes only to AgentPipelineView
  const cleanContentStr = contentStr.replace(/<thinking[\s\S]*?<\/thinking>/gi, '').trim();
  // أثناء البث الطويل جداً نتجنّب إعادة تحليل ماركداون ثقيل إطاراً بإطار
  // (سبب رئيسي للتجميد/الخطأ #310) — نعرض نصاً خاماً سريعاً حتى يكتمل الرد.
  const heavyStreaming = isStreaming && contentStr.length > 20000;

  const handleRunPython = (code: string, blockIndex: number) => {
    setPyResults(prev => ({ ...prev, [blockIndex]: { ok: false, stdout: '', stderr: '', running: true } }));
    fetch('/api/python/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, sessionId: `chat-${message.id}` })
    })
      .then(r => r.json())
      .then((data: PythonRunResult) => setPyResults(prev => ({ ...prev, [blockIndex]: { ...data, running: false } })))
      .catch(err => setPyResults(prev => ({
        ...prev,
        [blockIndex]: { ok: false, stdout: '', stderr: String(err), running: false }
      })));
  };

  const handleCopy = async () => {
    const ok = await copyText(message.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error('تعذر النسخ — انسخ النص يدوياً بالتحديد');
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editText.trim() && onEditPrompt) {
      onEditPrompt(message.id, editText.trim());
      setIsEditing(false);
    }
  };

  // Compact time label (e.g. 14:32) shown under each bubble
  const timeLabel = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Helper to cleanly format model ID with MijlAI prefix
  const formatModelBadge = (rawModelId?: string) => {
    if (!rawModelId) return 'MijlAI Engine';
    if (rawModelId.startsWith('local:')) {
      const name = rawModelId.replace('local:', '').split('/').pop()?.replace(/\.gguf$/i, '') || rawModelId;
      return `${name} (محلي)`;
    }
    const cleanName = rawModelId.replace('g4f:', '').replace('MijlAI ', '');
    return `MijlAI ${cleanName}`;
  };

  const handleReact = (emoji: string) => {
    setReactions(prev => ({ ...prev, [emoji]: !prev[emoji] }));
  };

  return (
    <div className={`w-full flex my-4 transition-all duration-300 message-enter ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group relative max-w-[88%] md:max-w-[82%] transition-all ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        {/* Soothing Curved Chat Bubble — user bubble paints itself from theme
            accent tokens (--accent-grad-a/b, --accent-glow); AI bubble uses
            semantic surface tokens. Both follow the active [data-theme]. */}
        <div
          style={isUser ? {
            background: 'linear-gradient(135deg, var(--accent-grad-a), var(--accent-grad-b))',
            boxShadow: '0 4px 20px var(--accent-glow), inset 0 1px 1px rgba(255,255,255,0.3)',
          } : undefined}
          className={`relative px-5 py-4.5 sm:px-6 sm:py-5 transition-all duration-200 ${
            isUser
              ? 'text-white rounded-[28px] rounded-br-md'
              : 'bg-surface/95 border border-line/80 text-main rounded-[28px] rounded-bl-md shadow-[0_4px_24px_rgba(0,0,0,0.04)]'
          }`}
        >
          {/* Header Role info & Model Tag */}
          <div className={`flex items-center justify-between gap-3 mb-3 ${isUser ? 'text-blue-100' : 'text-muted'}`}>
            <div className="flex items-center gap-2">
              {/* Soothing Bubble Avatar */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-sm transition-transform group-hover:scale-105 ${
                  isUser
                    ? 'bg-white/20 text-white border border-white/30 backdrop-blur-sm'
                    : 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-emerald-500/20'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
              </div>

              <span className={`font-semibold text-xs tracking-wide ${isUser ? 'text-white' : 'text-main'}`}>
                {isUser ? 'أنت' : 'MijlAi'}
              </span>

              {!isUser && message.modelId && (
                <span className="text-[10px] bg-accent-soft text-accent px-2.5 py-0.5 rounded-full font-medium border border-emerald-200/60">
                  {formatModelBadge(message.modelId)}
                </span>
              )}
            </div>

            {/* Quick Action Tools (always visible on touch devices, hover on desktop) */}
            <div className="flex items-center gap-1 flex-wrap justify-end max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className={`tap p-1.5 rounded-xl transition-colors ${
                  isUser ? 'hover:bg-white/20 text-white' : 'hover:bg-card text-muted hover:text-main'
                }`}
                title="نسخ الرسالة"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {!isUser && (
                <button
                  onClick={handleToggleReadAloud}
                  className={`tap p-1.5 rounded-xl transition-colors ${
                    isUser
                      ? 'hover:bg-white/20 text-white'
                      : isSpeaking
                        ? 'bg-accent-soft text-accent hover:bg-accent-soft'
                        : 'hover:bg-card text-muted hover:text-main'
                  }`}
                  title={isSpeaking ? 'إيقاف القراءة الصوتية' : 'قراءة الرد بصوت عالٍ'}
                  aria-pressed={isSpeaking}
                >
                  {isSpeaking ? <Square className="w-3 h-3 fill-current animate-pulse" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}

              {isUser && onEditPrompt && (
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="tap p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                  title="تعديل الرسالة"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && onRegenerate && isLastAssistantMessage && (
                <button
                  onClick={onRegenerate}
                  className="tap p-1.5 rounded-xl hover:bg-card text-muted hover:text-accent transition-colors"
                  title="إعادة التوليد"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Thread Actions Menu (⋯) — غير المستخدم/مساعد */}
              {!isUser && (
                <div className="relative">
                  <button
                    onClick={() => setShowActions(!showActions)}
                    className="tap p-1.5 rounded-xl hover:bg-card text-muted hover:text-accent transition-colors"
                    title="خيارات الرسالة"
                    aria-haspopup="menu"
                    aria-expanded={showActions}
                    aria-controls="message-actions-menu"
                    aria-label="خيارات الرسالة"
                  >
                    <span className="w-3.5 h-3.5 text-faint flex items-center justify-center">⋯</span>
                  </button>

                  {showActions && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowActions(false)}
                        aria-hidden="true"
                      />
                      <div
                        id="message-actions-menu"
                        role="menu"
                        aria-label="خيارات الرسالة"
                        className="absolute end-0 bottom-full mb-1 z-50 w-48 bg-surface rounded-xl shadow-2xl border border-line p-1 animate-in fade-in zoom-in-95 duration-150"
                      >
                        <button
                          role="menuitem"
                          onClick={() => { onRegenerate(); setShowActions(false); }}
                          className="w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-main hover:bg-card transition-colors flex items-center gap-2"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>إعادة التوليد</span>
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            navigator.clipboard.writeText(message.content);
                            toast.success('تم النسخ');
                            setShowActions(false);
                          }}
                          className="w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-main hover:bg-card transition-colors flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          <span>نسخ الرد</span>
                        </button>
                        {onEditPrompt && (
                          <button
                            role="menuitem"
                            onClick={() => { onEditPrompt(message.id, message.content); setShowActions(false); }}
                            className="w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-main hover:bg-card transition-colors flex items-center gap-2"
                          >
                            <Edit3 className="w-4 h-4" />
                            <span>تعديل السؤال</span>
                          </button>
                        )}
                        <button
                          role="menuitem"
                          onClick={() => {
                            toast.info('ميزة التفرع ستتوفر قريباً');
                            setShowActions(false);
                          }}
                          className="w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-main hover:bg-card transition-colors flex items-center gap-2"
                        >
                          <div className="w-4 h-4 relative">
                            <div className="absolute inset-0 border-2 border-accent rounded-full" />
                            <div className="absolute inset-1 border-2 border-transparent rounded-full" />
                          </div>
                          <span>تفرع من هنا</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* User Edit Mode */}
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-white/20 border border-white/40 rounded-2xl p-3 text-xs text-white placeholder-blue-200 outline-none resize-none"
                rows={3}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs text-blue-100 hover:text-white"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 bg-surface text-accent font-bold text-xs rounded-xl shadow-sm hover:bg-accent-soft"
                >
                  حفظ وإرسال
                </button>
              </div>
            </form>
          ) : (
            /* Rendered Content */
            <div dir="auto" className="relative text-sm leading-relaxed">
              {/* Agent Pipeline View — unified rendering for all phases */}
              {!isUser && !isEditing && (
                <AgentPipelineView
                  status={message.status}
                  thinking={message.thinking}
                  contentStr={cleanContentStr || ''}
                  searchCount={(message.searchSources?.length || message.deepSearch?.references?.length) || 0}
                  thinkChars={message.thinking ? message.thinking.length : 0}
                  caretMode={caretMode}
                />
              )}

              {/* Deep Search reasoning panel (Area 2) */}
              {!isUser && !!message.deepSearch?.reasoning_steps?.length && (
                <DeepSearchPanel
                  reasoningSteps={message.deepSearch.reasoning_steps}
                  references={message.deepSearch.references}
                />
              )}

              {/* Web search source chips */}
              {!isUser && !!message.searchSources?.length && (
                <div className="flex flex-wrap gap-1.5 mb-3" dir="rtl">
                  <span className="text-[10px] font-bold text-faint flex items-center gap-1 w-full mb-0.5">
                    <Globe className="w-3 h-3" /> مصادر البحث ({message.searchSources.length})
                  </span>
                  {message.searchSources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      title={s.title}
                      className="max-w-[220px] truncate text-[10px] px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200/70 text-sky-700 hover:bg-sky-100 transition-colors">
                      {i + 1}. {s.title || safeHostname(s.url)}
                    </a>
                  ))}
                </div>
              )}

              {isError ? (
                <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 p-3.5 rounded-2xl">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold">حدث خطأ أثناء توليد الرد</div>
                    <div className="mt-1 opacity-90">{message.errorDetails || message.content}</div>
                    <div className="mt-1.5 text-[10px] text-red-400/90 flex items-center gap-1"><Lightbulb className="w-3 h-3" /> جرّب إعادة المحاولة أو التبديل لنموذج آخر (Mini / Flash) من شريط الإدخال.</div>
                    {onRegenerate && (
                      <button
                        onClick={onRegenerate}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition-colors active:scale-95"
                      >
                        <RefreshCw className="w-3 h-3" />
                        إعادة المحاولة
                      </button>
                    )}
                  </div>
                </div>
              ) : message.isImage && !isUser ? (
                <div className="relative">
                  <MarkdownBoundary content={cleanContentStr}>
                    <RichMarkdown content={cleanContentStr} isStreaming={isStreaming} isUser={isUser} />
                  </MarkdownBoundary>
                </div>
              ) : isUser ? (
                <div>
                  {/* Attached images preview */}
                  {!!message.attachments?.length && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {message.attachments.map(a =>
                        a.mime.startsWith('image/') ? (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={a.url}
                              alt={a.name}
                              loading="lazy"
                              className="max-w-[180px] max-h-[180px] rounded-xl border border-white/30 object-cover"
                            />
                          </a>
                        ) : (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                             className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/15 border border-white/25 text-[11px] text-white hover:bg-white/25 transition-colors">
                            <FileText className="w-3.5 h-3.5" /> {a.name}
                          </a>
                        )
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap font-normal text-white text-[15px] leading-relaxed" style={{ unicodeBidi: 'plaintext' }}>{cleanContentStr}</div>
                </div>
              ) : isQueued ? (
                /* رسالة منتظرة في الطابور — حركة الثلاث خطوط + شريحة الحالة */
                <div className="py-1">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-faint pb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    في الطابور — تنتظر دورها للإرسال...
                  </div>
                  <WaitingLines variant="pulse" />
                </div>
              ) : (isStreaming || isThinking) && !message.content ? (
                /* انتظار أول توكن — Thinking State: مؤشر "جاري التفكير…" بنقاط
                   وردة Gemini (دوران + فتح/انضمام) بدل المؤثرات الكثيفة السابقة */
                <div className="py-1 space-y-2" aria-live="polite">
                  <div className="flex items-center gap-2.5" dir="rtl">
                    <GeminiBloom />
                    <span className="text-[13px] font-bold gradient-text">
                      {isThinking ? 'جاري التفكير' : 'يجهّز الرد'}
                    </span>
                  </div>
                </div>
              ) : readingMode && isReadable ? (
                <RenderErrorBoundary fallback={<div className="whitespace-pre-wrap text-main text-sm">{cleanContentStr}</div>}>
                  <ReadingModePane content={cleanContentStr} onClose={() => setReadingMode(false)} />
                </RenderErrorBoundary>
              ) : heavyStreaming ? (
                <pre className="whitespace-pre-wrap break-words text-sm text-main font-sans leading-relaxed" dir="auto">{cleanContentStr}</pre>
              ) : (
                <RenderErrorBoundary fallback={<div className="whitespace-pre-wrap text-main text-sm">{cleanContentStr}</div>}>
                  <MarkdownBoundary content={cleanContentStr}>
                    <RichMarkdown content={cleanContentStr} isStreaming={isStreaming} isUser={isUser} onRunPython={handleRunPython} onOpenCanvas={onOpenCanvas} />
                  </MarkdownBoundary>
                </RenderErrorBoundary>
              )}

              {/* Python execution outputs (agentic terminal) */}
              {Object.entries(pyResults).map(([idxStr, res]: [string, PythonRunResult]) => {
                const idx = Number(idxStr);
                return (
                <div key={idx} dir="ltr" className="mt-3 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 shadow-lg">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/70 border-b border-slate-800 text-[10px] font-bold">
                    <TerminalSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Python</span>
                    <span className="text-muted font-normal">workspace/{message.id.slice(-6)}</span>
                    {res.running ? (
                      <span className="ms-auto flex items-center gap-1.5 text-blue-300"><Loader2 className="w-3 h-3 animate-spin" /> executing…</span>
                    ) : (
                      <span className={`ms-auto ${res.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                        exit {res.ok ? 0 : '?'} · {((res.duration_ms || 0) / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <pre className="max-h-56 overflow-auto px-4 py-3 text-[11.5px] font-mono whitespace-pre-wrap">
                    {res.running && <span className="text-blue-300">▶ Running…</span>}
                    {!res.running && res.stdout}
                    {!res.running && res.stderr && (
                      <span className="text-red-400">{(res.stdout ? '\n' : '') + res.stderr}</span>
                    )}
                    {!res.running && !res.stdout && !res.stderr && <span className="text-muted">(no output)</span>}
                  </pre>
                </div>
                );
              })}

              {/* Streaming caret + live char counter (tracking the reply end) */}
              {isStreaming && !!message.content && caretMode !== 'none' && (
                <span className="inline-flex items-center gap-1.5 ms-1 align-middle text-faint select-none" aria-hidden="true">
                  {caretMode === 'block'
                    ? <span className="stream-caret-block" />
                    : <span className="stream-caret-pulse" />}
                  <span className="text-[9.5px] font-semibold tabular-nums tracking-tight">
                    {message.content.length.toLocaleString('en-US')}
                  </span>
                </span>
              )}

              {/* Reading mode toggle for long replies */}
              {isReadable && (
                <button
                  onClick={() => setReadingMode((o) => !o)}
                  className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold border border-line text-muted hover:text-accent hover:border-accent/50 hover:bg-accent-soft/40 transition-colors"
                >
                  <BookOpenText className={`w-3.5 h-3.5 ${readingMode ? 'text-accent' : ''}`} />
                  {readingMode ? 'إغلاق القراءة المريحة' : 'قراءة مريحة'}
                </button>
              )}
            </div>
          )}

          {/* Timestamp — subtle, shown under every bubble */}
          {!isEditing && (
            <div className={`mt-1.5 text-[10px] font-medium tracking-wide ${isUser ? 'text-blue-300/80' : 'text-faint/90'}`} dir="ltr">
              {timeLabel}
            </div>
          )}

          {/* Message Reactions — interactive emoji responses */}
          {!isEditing && (
            <MessageReactions
              messageId={message.id}
              reactions={reactions}
              onReact={handleReact}
              isUser={isUser}
            />
          )}
        </div>
      </div>
    </div>
  );
});
