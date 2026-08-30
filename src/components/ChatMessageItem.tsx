import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, RotateCcw, Edit3, User, AlertCircle, Sparkles, TerminalSquare, Globe, Loader2, RefreshCw, FileText, Volume2, Square } from 'lucide-react';
import { ChatMessage } from '../types';
import { RichMarkdown } from './RichMarkdown';
import { ThinkingPanel } from './ThinkingPanel';
import { ThinkingSteps } from './ThinkingSteps';
import { DeepSearchPanel } from './DeepSearchPanel';
import { WaitingIndicator, WaitingLines } from './WaitingAnimations';
import { MessageReactions } from './MessageReactions';
import { copyText } from '../utils/clipboard';
import { speakText, stopSpeaking } from '../utils/tts';
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
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = React.memo(({
  message,
  onRegenerate,
  onEditPrompt,
  isLastAssistantMessage,
  onOpenCanvas
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [pyResults, setPyResults] = useState<Record<number, PythonRunResult>>({});
  const [reactions, setReactions] = useState<Record<string, boolean>>({});
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakingRef = useRef(false);

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
        {/* Soothing Curved Chat Bubble */}
        <div
          className={`relative px-5 py-4.5 sm:px-6 sm:py-5 transition-all duration-200 ${
            isUser
              ? 'bg-gradient-to-br from-[#2563eb] via-[#1d4ed8] to-[#3b82f6] text-white rounded-[28px] rounded-br-md shadow-[0_4px_20px_rgba(37,99,235,0.22),inset_0_1px_1px_rgba(255,255,255,0.3)]'
              : 'bg-white/95 border border-slate-200/80 text-slate-800 rounded-[28px] rounded-bl-md shadow-[0_4px_24px_rgba(0,0,0,0.04)] backdrop-blur-md'
          }`}
        >
          {/* Header Role info & Model Tag */}
          <div className={`flex items-center justify-between gap-3 mb-3 ${isUser ? 'text-blue-100' : 'text-slate-500'}`}>
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

              <span className={`font-semibold text-xs tracking-wide ${isUser ? 'text-white' : 'text-slate-800'}`}>
                {isUser ? 'أنت' : 'MijlAi'}
              </span>

              {!isUser && message.modelId && (
                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-medium border border-emerald-200/60">
                  {formatModelBadge(message.modelId)}
                </span>
              )}
            </div>

            {/* Quick Action Tools (always visible on touch devices, hover on desktop) */}
            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded-xl transition-colors ${
                  isUser ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
                title="نسخ الرسالة"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {!isUser && (
                <button
                  onClick={handleToggleReadAloud}
                  className={`p-1.5 rounded-xl transition-colors ${
                    isUser
                      ? 'hover:bg-white/20 text-white'
                      : isSpeaking
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
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
                  className="p-1.5 rounded-xl hover:bg-white/20 text-white transition-colors"
                  title="تعديل الرسالة"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && onRegenerate && isLastAssistantMessage && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                  title="إعادة التوليد"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
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
                  className="px-3 py-1 bg-white text-blue-600 font-bold text-xs rounded-xl shadow-sm hover:bg-blue-50"
                >
                  حفظ وإرسال
                </button>
              </div>
            </form>
          ) : (
            /* Rendered Content */
            <div dir="auto" className="relative text-sm leading-relaxed">
              {/* Agentic Thinking Panel */}
              {!isUser && message.thinking && (
                <ThinkingPanel
                  thinking={message.thinking}
                  isThinking={isThinkingActive}
                  durationMs={message.thinkingDurationMs}
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
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 w-full mb-0.5">
                    <Globe className="w-3 h-3" /> مصادر البحث ({message.searchSources.length})
                  </span>
                  {message.searchSources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                      title={s.title}
                      className="max-w-[220px] truncate text-[10px] px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200/70 text-sky-700 hover:bg-sky-100 transition-colors">
                      {i + 1}. {s.title || new URL(s.url).hostname}
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
                    <div className="mt-1.5 text-[10px] text-red-400/90">💡 جرّب إعادة المحاولة أو التبديل لنموذج آخر (Mini / Flash) من شريط الإدخال.</div>
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
                  <RichMarkdown content={message.content} isStreaming={isStreaming} isUser={isUser} />
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
                  <div className="whitespace-pre-wrap font-normal text-white text-[15px] leading-relaxed" style={{ unicodeBidi: 'plaintext' }}>{message.content}</div>
                </div>
              ) : isQueued ? (
                /* رسالة منتظرة في الطابور — حركة الثلاث خطوط + شريحة الحالة */
                <div className="py-1">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-400 pb-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    في الطابور — تنتظر دورها للإرسال...
                  </div>
                  <WaitingLines variant="pulse" />
                </div>
              ) : (isStreaming || isThinking) && !message.content ? (
                /* انتظار أول توكن: توقيع EKG MijlAI + خطوات التفكير المرئية (نمط Kimi) */
                <div className="py-1 space-y-1">
                  <WaitingIndicator />
                  <ThinkingSteps
                    status={message.status}
                    hasThinkingText={!!message.thinking}
                    hasContent={!!message.content}
                  />
                </div>
              ) : (
                <RichMarkdown content={message.content} isStreaming={isStreaming} isUser={isUser} onRunPython={handleRunPython} onOpenCanvas={onOpenCanvas} />
              )}

              {/* Python execution outputs (agentic terminal) */}
              {Object.entries(pyResults).map(([idxStr, res]: [string, PythonRunResult]) => {
                const idx = Number(idxStr);
                return (
                <div key={idx} dir="ltr" className="mt-3 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900 text-slate-100 shadow-lg">
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/70 border-b border-slate-800 text-[10px] font-bold">
                    <TerminalSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Python</span>
                    <span className="text-slate-500 font-normal">workspace/{message.id.slice(-6)}</span>
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
                    {!res.running && !res.stdout && !res.stderr && <span className="text-slate-500">(no output)</span>}
                  </pre>
                </div>
                );
              })}

              {/* Smooth Pulse Streaming Indicator */}
              {isStreaming && (
                <span className="inline-block w-2.5 h-4 ms-1.5 bg-blue-500 animate-pulse rounded-full align-middle" />
              )}
            </div>
          )}

          {/* Timestamp — subtle, shown under every bubble */}
          {!isEditing && (
            <div className={`mt-1.5 text-[10px] font-medium tracking-wide ${isUser ? 'text-blue-300/80' : 'text-slate-400/90'}`} dir="ltr">
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
