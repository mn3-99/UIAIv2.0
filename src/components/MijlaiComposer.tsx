import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Paperclip, Mic, MicOff, Send, Sparkles, X,
  BookOpen, Swords, MoreHorizontal, ChevronDown, FileText,
  Image, Camera, Plus, Brain
} from 'lucide-react';
import { useSpeechRecognition, isSpeechRecognitionSupported } from '../utils/speech';
import { TIERS, isGuestTier, getCustomTiers } from '../models/tiers';
import { useComposerFocus } from './ComposerFocusContext';
import { Kbd } from './Kbd';
import { toast } from './Toast';

interface MijlaiComposerProps {
  input: string;
  setInput: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  selectedTier: string;
  onSelectTier: (tier: string) => void;
  onAttachFile: (file: File) => void;
  onGenerateImage?: (prompt: string) => void;
  knowledgeEnabled?: boolean;
  setKnowledgeEnabled?: (val: boolean) => void;
  localModels?: Array<{ id: string; name: string }>;
  attachments?: Array<{ id: string; name: string; url: string; mime: string; size?: number }>;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  queueCount?: number;
  isGuest?: boolean;
  arenaMode?: boolean;
  onToggleArena?: () => void;
}

const TOOLBAR_HEIGHT = 56;
const TEXTAREA_MIN_HEIGHT = 56;
const TEXTAREA_MAX_HEIGHT = 300;

const MobileActionBtn: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
  destructive?: boolean;
}> = ({ icon: Icon, active, disabled, label, onToggle, destructive }) => (
  <button
    onClick={onToggle}
    disabled={disabled}
    className={`
      w-full min-h-[48px] px-4 rounded-2xl flex items-center gap-3 text-sm font-medium transition-all duration-200
      focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none tap
      disabled:opacity-40 disabled:cursor-not-allowed
      ${active ? 'bg-accent-soft text-accent' : destructive ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-surface/50 text-main hover:bg-surface hover:text-main'}
    `}
    aria-pressed={active}
    aria-disabled={disabled}
  >
    <Icon className="w-5.5 h-5.5 shrink-0" />
    <span className="flex-1 text-start truncate">{label}</span>
    {active && <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />}
  </button>
);

const ToolbarButton: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  'aria-label': string;
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
  className?: string;
  title?: string;
  id?: string;
}> = ({ children, onClick, disabled, 'aria-label': ariaLabel, 'aria-pressed': ariaPressed, 'aria-expanded': ariaExpanded, className = '', title, id }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    id={id}
    className={`
      h-10 w-10 min-h-[44px] min-w-[44px] rounded-2xl flex items-center justify-center transition-all duration-200
      focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none tap
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'text-muted hover:text-accent hover:bg-surface/50'}
      ${className}
    `}
    aria-label={ariaLabel}
    aria-pressed={ariaPressed}
    aria-expanded={ariaExpanded}
    title={title}
  >
    {children}
  </button>
);

export const MijlaiComposer: React.FC<MijlaiComposerProps> = ({
  input,
  setInput,
  onSend,
  onStop,
  isGenerating,
  selectedTier,
  onSelectTier,
  onAttachFile,
  onGenerateImage,
  knowledgeEnabled = false,
  setKnowledgeEnabled,
  localModels = [],
  attachments = [],
  onRemoveAttachment,
  isUploading = false,
  queueCount = 0,
  isGuest = false,
  arenaMode = false,
  onToggleArena,
}) => {
  const { focusComposer } = useComposerFocus();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isTierOpen, setIsTierOpen] = useState(false);
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [moreOpenMobile, setMoreOpenMobile] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Speech recognition
  const {
    isListening,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    onResult: (text, isFinal) => {
      if (isFinal) {
        setInput(input + text + ' ');
      } else {
        // Show interim transcript as placeholder or in a preview
      }
    },
    onError: (error) => {
      toast.error(error);
    },
    onStart: () => {
      setIsRecording(true);
    },
    onEnd: () => {
      setIsRecording(false);
    },
  });

  const isSpeechSupported = isSpeechRecognitionSupported();

  const toggleVoiceInput = useCallback(() => {
    if (isRecording || isListening) {
      stopListening();
      setIsRecording(false);
    } else if (isSpeechSupported) {
      startListening();
    } else {
      toast.error('التعرف على الصوت غير مدعوم في هذا المتصفح — جرّب Chrome أو Edge');
    }
  }, [isRecording, isListening, isSpeechSupported, startListening, stopListening]);

  const handleOptimizePrompt = useCallback(() => {
    if (input.trim()) {
      setIsOptimizing(true);
      setTimeout(() => setIsOptimizing(false), 2000);
    }
  }, [input]);

  // Smart suggestions based on input
  const suggestions = useMemo(() => {
    if (!input.trim() || input.length < 2 || isGenerating) return [];
    const base = input.trim().toLowerCase();
    const common = [
      'ابحث عن', 'سعر الدولار', 'كود بايثون', 'شرح', 'ترجم', 'لخّص',
      'سعر الذهب', 'أخبار اليوم', 'كود javascript', 'دالة typescript',
      'اكتب كود', 'حل مشكلة', 'خطط لـ', 'قارن بين'
    ];
    return common
      .filter(s => s.toLowerCase().startsWith(base) || base.includes(s.split(' ')[0]))
      .slice(0, 4)
      .map(text => ({ text, reason: 'اقتراح ذكي' }));
  }, [input, isGenerating]);

  // Enhanced auto-resize with smooth animation using ResizeObserver
  useEffect(() => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    
    const updateHeight = () => {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    };
    
    updateHeight();
    
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
        textarea.style.height = `${newHeight}px`;
      });
    });
    
    resizeObserver.observe(textarea);
    return () => resizeObserver.disconnect();
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      if (isAttachOpen || isTierOpen || moreOpen || moreOpenMobile || showModelSelector) {
        e.preventDefault();
        e.stopPropagation();
        setIsAttachOpen(false);
        setIsTierOpen(false);
        setMoreOpen(false);
        setMoreOpenMobile(false);
        setShowModelSelector(false);
      }
      return;
    }
    if (e.key === 'Tab' && suggestions.length > 0 && !e.shiftKey) {
      e.preventDefault();
      setInput(suggestions[0].text);
      setShowSuggestions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const coarseOnly = typeof window !== 'undefined' && !!window.matchMedia?.(
        '(pointer: coarse) and (not (any-pointer: fine))'
      ).matches;
      if (coarseOnly) return;
      e.preventDefault();
      if (input.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAttachFile(e.target.files[0]);
    }
    setIsAttachOpen(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onAttachFile(e.dataTransfer.files[0]);
    }
    setIsAttachOpen(false);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      onAttachFile(e.clipboardData.files[0]);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        onAttachFile(target.files[0]);
      }
    };
    input.click();
  };

  // Model metadata from single source of truth
  const verifiedModelsMap = useMemo(() => ({ ...TIERS, ...getCustomTiers() }), []);

  const visibleModelsMap = useMemo(
    () => Object.fromEntries(Object.entries({ ...TIERS, ...getCustomTiers() }).filter(([, t]) => isGuestTier(t.id) || !isGuest)),
    [isGuest]
  );

  const isLocalTier = selectedTier.startsWith('local:');
  const localModelName = localModels.find((m) => m.id === selectedTier)?.name;
  const currentTier = isLocalTier
    ? { label: localModelName || 'نموذج محلي', shortName: 'محلي', icon: Brain, color: 'text-emerald-500', desc: 'نموذج llama.cpp محلي — خاص وبدون إنترنت' }
    : (verifiedModelsMap[selectedTier] || verifiedModelsMap['flash']);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (composerContainerRef.current && !composerContainerRef.current.contains(e.target as Node)) {
        setIsTierOpen(false);
        setIsAttachOpen(false);
        setMoreOpen(false);
        setMoreOpenMobile(false);
        setShowModelSelector(false);
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasAttachments = (attachments?.length ?? 0) > 0;
  const hasInput = input.trim().length > 0;
  const isDisabled = !hasInput || isGenerating;

  // Show suggestions when typing and has relevant suggestions
  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && hasInput && !isGenerating);
  }, [suggestions, hasInput, isGenerating]);

  return (
    <div
      ref={composerContainerRef}
      className="w-full flex flex-col touch-pan-x"
      style={{ touchAction: 'pan-x' }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf,.txt,.md,.js,.ts,.jsx,.tsx,.py,.json,.csv"
        className="hidden"
        onChange={handleFileChange}
        multiple
      />

      {/* Attachments Preview - compact, above composer */}
      {hasAttachments && (
        <div className="mx-3 mt-2 flex flex-wrap gap-1.5 animate-in slide-in-from-top-2 duration-200" role="list" aria-label="المرفقات">
          {attachments.map((att) => (
            <div key={att.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface/50 border border-line/40 rounded-2xl text-xs text-main animate-in fade-in zoom-in-95 duration-200" role="listitem">
              {(att.mime?.startsWith('image/') ? (
                <img src={att.url} alt={att.name} className="w-7 h-7 rounded-xl object-cover" />
              ) : (
                <FileText className="w-4.5 h-4.5 text-muted shrink-0" />
              ))}
              <span className="truncate max-w-[160px]">{att.name}</span>
              <span className="text-[10px] text-faint shrink-0">({(att.size ?? 0) / 1024 > 1024 ? `${(att.size! / 1024 / 1024).toFixed(1)}MB` : `${(att.size ?? 0) / 1024}KB`})</span>
              <button
                onClick={() => onRemoveAttachment?.(att.id)}
                className="w-5 h-5 rounded-xl flex items-center justify-center text-faint hover:text-red-500 hover:bg-red-50/50 transition-colors tap"
                aria-label={`إزالة ${att.name}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Composer - Fluid, Full-width with Smart Interactions */}
      <div
        className="relative flex flex-col bg-surface/60 backdrop-blur-2xl border border-line/30 rounded-3xl transition-all duration-300 shadow-xl touch-pan-x"
        style={{ 
          touchAction: 'pan-x',
          boxShadow: '0 4px 24px -4px rgba(0,0,0,0.08), 0 8px 32px -8px rgba(0,0,0,0.04)'
        }}
        role="form"
        aria-label="مؤلف الرسالة"
      >
        
        {/* Textarea - Full Width Hero Element with Fluid Interactions */}
        <div className="relative flex-1 min-h-[56px] max-h-[320px]">
          <textarea
            id="main_input"
            ref={textareaRef}
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onPaste={handlePaste}
            onFocus={() => setShowSuggestions(suggestions.length > 0 && hasInput && !isGenerating)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder={isGenerating ? 'MijlAI يفكر...' : 'اسأل MijlAi أي شيء...'}
            rows={1}
            className={`
              w-full h-full bg-transparent outline-none border-none resize-none
              text-[16px] md:text-[17px] text-main placeholder:text-faint font-normal leading-relaxed
              px-5 py-4 pe-14
              transition-all duration-300 ease-out
              font-sans
              selection:bg-accent-soft
            `}
            style={{
              fontFamily: 'Inter, "Google Sans", "Noto Sans Arabic", system-ui, sans-serif',
              height: 'auto',
              minHeight: `${TEXTAREA_MIN_HEIGHT}px`,
              maxHeight: `${TEXTAREA_MAX_HEIGHT}px`,
            }}
            role="textbox"
            aria-multiline="true"
            aria-label="اكتب رسالتك لـ MijlAi"
            autoComplete="off"
            autoCapitalize="sentences"
            spellCheck={false}
            inputMode="text"
          />

          {/* Smart Suggestions - Gemini Style */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute bottom-full start-4 end-4 mb-2 z-20 animate-in slide-in-from-bottom-2 duration-200" role="list" aria-label="اقتراحات ذكية">
              <div className="bg-surface/95 backdrop-blur-xl border border-line/30 rounded-2xl shadow-2xl p-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.text}-${i}`}
                    onClick={() => { setInput(s.text); setShowSuggestions(false); }}
                    className="w-full group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-main hover:bg-accent-soft/50 transition-all duration-150 tap"
                    title={`${s.reason} — Tab للقبول`}
                    role="listitem"
                  >
                    <div className="w-7 h-7 rounded-xl bg-accent-soft/50 flex items-center justify-center shrink-0 group-hover:bg-accent-soft group-hover:text-accent transition-colors">
                      <Sparkles className="w-4 h-4 text-accent/70" strokeWidth={2} />
                    </div>
                    <span className="flex-1 text-start truncate" dir="auto">{s.text}</span>
                    <kbd className="hidden sm:flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold bg-blue-600/10 group-hover:bg-white/20 text-blue-600">
                      <ChevronDown className="w-3 h-3" />
                    </kbd>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Attachments inline preview - positioned below textarea */}
          {isAttachOpen && hasAttachments && (
            <div className="absolute bottom-full start-0 end-0 mb-2 z-10 animate-in slide-in-from-bottom-2 duration-200" style={{ pointerEvents: 'auto' }}>
              <div className="mx-4 mb-2 flex flex-wrap gap-2 animate-in slide-in-from-top-2 duration-200" role="list" aria-label="مرفقات جاهزة للإرسال">
                {attachments.map((att) => (
                  <div key={att.id} className="inline-flex items-center gap-2 px-3 py-2 bg-surface/70 border border-line/40 rounded-2xl text-sm text-main animate-in fade-in zoom-in-95 duration-200" role="listitem">
                    {(att.mime?.startsWith('image/') ? (
                      <img src={att.url} alt={att.name} className="w-8 h-8 rounded-xl object-cover" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted shrink-0" />
                    ))}
                    <span className="truncate max-w-[200px]">{att.name}</span>
                    <span className="text-[11px] text-faint shrink-0">({(att.size ?? 0) / 1024 > 1024 ? `${(att.size! / 1024 / 1024).toFixed(1)}MB` : `${(att.size ?? 0) / 1024}KB`})</span>
                    <button
                      onClick={() => onRemoveAttachment?.(att.id)}
                      className="w-6 h-6 rounded-xl flex items-center justify-center text-faint hover:text-red-500 hover:bg-red-50/50 transition-colors tap"
                      aria-label={`إزالة ${att.name}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live Voice Recording Bar - Gemini Style Overlay */}
          {isListening && (
            <div className="absolute bottom-full start-4 end-4 mb-2 z-20 animate-in fade-in scale-in-95 duration-200" style={{ pointerEvents: 'auto' }}>
              <div className="mx-4 px-4 py-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-200/60 rounded-2xl flex items-center justify-between backdrop-blur-xl shadow-xl">
                <div className="flex items-center gap-3 text-sm font-semibold text-red-700">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" style={{ animationDelay: '150ms' }} />
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>جاري الاستماع لصوتك والتحويل إلى نص...</span>
                </div>
                <button
                  onClick={toggleVoiceInput}
                  className="w-9 h-9 rounded-xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors tap"
                  aria-label="إيقاف التسجيل"
                >
                  <MicOff className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Smart Divider with Subtle Gradient */}
        <div className="h-px bg-gradient-to-r from-transparent via-line/40 to-transparent mx-4" aria-hidden="true" />

        {/* Bottom Toolbar - Fluid, Responsive, Gemini-Inspired */}
        <div className={`
          flex items-center justify-between px-4 py-3 border-t border-line/30
          bg-gradient-to-b from-transparent to-surface/40 backdrop-blur-sm rounded-b-3xl
          transition-all duration-300 ease-out
          ${isGenerating ? 'bg-amber-50/20 border-amber-200/40' : ''}
          ${isRecording ? 'bg-red-50/20 border-red-200/40' : ''}
        `} role="toolbar" aria-label="أدوات المحادثة">
          
          {/* Left Side - Primary Actions */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
            
            {/* Model Selector - Smart Dropdown */}
            {!arenaMode && !showModelSelector && (
              <button
                onClick={() => setShowModelSelector(true)}
                className="h-10 px-4 rounded-2xl flex items-center gap-2.5 text-sm font-medium text-main hover:bg-surface/50 transition-all duration-200 border border-line/30 bg-surface/50 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none tap"
                title="اختر النموذج (Ctrl+K)"
                aria-label="اختر النموذج"
                aria-haspopup="listbox"
              >
                <span className="w-5 h-5 rounded-full bg-gradient-to-br from-accent/20 to-accent/40 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-accent" strokeWidth={2.5} />
                </span>
                <span className="truncate max-w-[120px] hidden sm:inline">{currentTier.shortName}</span>
                <ChevronDown className="w-4 h-4 text-muted shrink-0" strokeWidth={2} />
              </button>
            )}

            {showModelSelector && (
              <>
                <button
                  onClick={() => setShowModelSelector(false)}
                  className="h-10 px-4 rounded-2xl flex items-center gap-2.5 text-sm font-medium text-accent bg-accent-soft/50 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none tap"
                  aria-label="إغلاق اختيار النموذج"
                >
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-accent/30 to-accent/50 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3 h-3 text-accent" strokeWidth={2.5} />
                  </span>
                  <span className="truncate max-w-[120px] hidden sm:inline">{currentTier.shortName}</span>
                  <ChevronDown className="w-4 h-4 text-accent shrink-0 rotate-180" strokeWidth={2} />
                </button>
                <div className="absolute bottom-full start-0 mb-2 w-72 max-w-[calc(100vw-2rem)] bg-surface rounded-2xl shadow-2xl border border-line p-2 space-y-1 z-50 text-start animate-in fade-in zoom-in-95 duration-200 overflow-y-auto" style={{ maxHeight: 'min(380px, 50vh)' }}>
                  <div className="px-3 py-2 text-[11px] font-bold text-faint sticky top-0 bg-surface/95 backdrop-blur-sm z-10 border-b border-line/50">
                    {isGuest ? 'نموذج مجاني — سجّل للمزيد' : 'نماذج MijlAI'}
                  </div>
                  {Object.entries(visibleModelsMap).map(([key, item], idx) => {
                    const Icon = item.icon;
                    const isSelected = selectedTier === key;
                    // تصنيف الموديل: سريع أو تفكير عميق (حسب الشارة)
                    const badge = item.badge || '';
                    const isFast = badge.includes('سريع') || badge.includes('الأسرع') || badge.includes('فائق السرعة') || (badge.includes('⚡') && !badge.includes('استدلال') && !badge.includes('تفكير'));
                    const isDeepThinking = badge.includes('تفكير') || badge.includes('استدلال') || badge.includes('🧠');
                    const tag = isDeepThinking ? 'تفكير عميق' : isFast ? 'سريع' : null;
                    const tagClass = isDeepThinking
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-emerald-600 dark:text-emerald-400';
                    return (
                      <button
                        key={key}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => { onSelectTier(key); setShowModelSelector(false); }}
                        className={`w-full text-start px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors duration-150 ${isSelected ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface/50 text-main'}`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 ${item.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold">{item.label}</div>
                          {tag && (
                            <div className={`text-[10px] font-medium mt-0.5 ${isSelected ? 'text-accent' : tagClass}`}>
                              {tag}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {localModels.length > 0 && (
                    <>
                      <div className="px-3 py-2 text-[11px] font-bold text-faint border-t border-line mt-1 pt-2 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-emerald-500" /> نماذج محلية
                      </div>
                      {localModels.map((m) => {
                        const isSelected = selectedTier === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => { onSelectTier(m.id); setShowModelSelector(false); }}
                            className={`w-full text-start px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${isSelected ? 'bg-accent-soft text-accent font-semibold' : 'hover:bg-surface/50 text-main'}`}
                          >
                            <Brain className={`w-5 h-5 shrink-0 ${isSelected ? 'text-accent' : 'text-emerald-500'}`} />
                            <div>
                              <div className="text-sm font-bold">{m.name}</div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              </>
            )}

            {/* Attachment Button - Primary Action */}
            <ToolbarButton
              onClick={() => setIsAttachOpen(!isAttachOpen)}
              aria-label={isAttachOpen ? 'إغلاق المرفقات' : 'إرفاق ملف أو صورة'}
              aria-expanded={isAttachOpen}
              aria-pressed={isAttachOpen}
              title={isAttachOpen ? 'إغلاق المرفقات' : 'إرفاق ملف أو صورة (Ctrl+U)'}
              className={isAttachOpen ? 'bg-accent-soft text-accent' : ''}
            >
              <Paperclip className="w-5 h-5" strokeWidth={2.2} />
            </ToolbarButton>

            {/* RAG Toggle */}
            <ToolbarButton
              onClick={() => setKnowledgeEnabled?.(!knowledgeEnabled)}
              aria-label="مستنداتي (RAG)"
              aria-pressed={knowledgeEnabled}
              title="الإجابة من مستنداتك المفهرسة (RAG محلي)"
              className={knowledgeEnabled ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : ''}
            >
              <BookOpen className="w-5 h-5" />
            </ToolbarButton>

            {/* Prompt Enhancer - Contextual */}
            {hasInput && !isGenerating && (
              <ToolbarButton
                onClick={handleOptimizePrompt}
                disabled={isOptimizing}
                aria-label="تحسين الأمر"
                title="تحسين وتوسيع الصياغة بالذكاء الاصطناعي (Shift+P)"
                className="bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-100"
              >
                <Sparkles className={`w-5 h-5 text-amber-600 ${isOptimizing ? 'animate-spin' : ''}`} strokeWidth={2.2} />
              </ToolbarButton>
            )}

            {/* Arena Toggle */}
            {onToggleArena && (
              <ToolbarButton
                onClick={onToggleArena}
                aria-label="ساحة المقارنة"
                aria-pressed={arenaMode}
                title="ساحة المقارنة: أرسل السؤال لنموذجين وقارن الإجابتين"
                className={arenaMode ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30' : ''}
              >
                <Swords className="w-5 h-5" strokeWidth={2.2} />
              </ToolbarButton>
            )}
          </div>

          {/* Right Side - Voice + Send/Stop */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            
            {/* Voice Button - Prominent */}
            <ToolbarButton
              id="voice_input"
              onClick={toggleVoiceInput}
              aria-label={isListening ? 'إيقاف التسجيل' : 'الإملاء الصوتي'}
              aria-pressed={isListening}
              title={isListening ? 'إيقاف التسجيل' : 'الإملاء الصوتي'}
              className={isListening ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30' : ''}
            >
              {isListening ? <MicOff className="w-5.5 h-5.5" strokeWidth={2.2} /> : <Mic className="w-5.5 h-5.5" strokeWidth={2.2} />}
            </ToolbarButton>

            {/* Queue Counter */}
            {queueCount > 0 && (
              <span className="h-10 px-4 rounded-2xl flex items-center gap-2 text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200/70 animate-in fade-in duration-200" role="status" aria-live="polite">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="hidden sm:inline">{queueCount}</span>
              </span>
            )}

            {/* Send / Stop Button - Hero Action */}
            {isGenerating ? (
              <button
                onClick={onStop}
                className="stop-btn h-10 w-10 min-h-[48px] min-w-[48px] rounded-2xl text-white flex items-center justify-center transition-all duration-200 press-effect tap shadow-lg"
                title="إيقاف التوليد"
                aria-label="إيقاف التوليد"
                aria-pressed="true"
              >
                <span className="busy-indicator-dot" aria-hidden="true" />
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            ) : (
              <button
                id="send_btn"
                onClick={onSend}
                disabled={isDisabled}
                className={`
                  send-btn h-10 w-10 min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center transition-all duration-200 press-effect scale-in-bounce tap shadow-lg shadow-accent/40
                  ${isDisabled
                    ? 'opacity-40 cursor-not-allowed'
                    : 'text-white bg-gradient-to-br from-accent to-accent-hover hover:from-accent-hover hover:to-accent'
                  }
                `}
                title="إرسال (Enter)"
                aria-label="إرسال الرسالة"
                aria-disabled={isDisabled}
              >
                <Send className="w-6 h-6" strokeWidth={2.2} />
              </button>
            )}

            {/* More Menu - Three Dots with Full Actions (mobile + desktop) */}
            <div className="relative">
              <ToolbarButton
                onClick={() => setMoreOpenMobile(!moreOpenMobile)}
                aria-label="خيارات إضافية"
                aria-expanded={moreOpenMobile}
                aria-haspopup="menu"
                title="المزيد من الخيارات"
              >
                <MoreHorizontal className="w-5.5 h-5.5" strokeWidth={2.2} />
              </ToolbarButton>
              {moreOpenMobile && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreOpenMobile(false)} />
                  <div className="absolute bottom-full end-full right-auto mb-2 z-40 w-64 bg-surface rounded-2xl shadow-2xl border border-line p-2 space-y-1 animate-in fade-in zoom-in-95 duration-200">
                    {/* File Attachment */}
                    <MobileActionBtn 
                      icon={FileText} 
                      label="إرفاق ملف" 
                      onToggle={() => { fileInputRef.current?.click(); setMoreOpenMobile(false); }} 
                    />
                    {/* Image Attachment */}
                    <MobileActionBtn 
                      icon={Image} 
                      label="إرفاق صورة" 
                      onToggle={() => { handleImageClick(); setMoreOpenMobile(false); }} 
                    />
                    {/* Camera */}
                    <MobileActionBtn 
                      icon={Camera} 
                      label="الكاميرا" 
                      onToggle={() => { handleCameraClick(); setMoreOpenMobile(false); }} 
                    />
                    <hr className="border-line my-1" />
                    {/* RAG Toggle */}
                    <MobileActionBtn 
                      icon={BookOpen} 
                      active={knowledgeEnabled} 
                      label="مستنداتي (RAG)" 
                      onToggle={() => { setKnowledgeEnabled?.(!knowledgeEnabled); setMoreOpenMobile(false); }} 
                    />
                    {/* Prompt Enhancer */}
                    {hasInput && (
                      <MobileActionBtn 
                        icon={Sparkles} 
                        disabled={isOptimizing} 
                        label={isOptimizing ? 'جاري التحسين…' : 'تحسين الأمر'} 
                        onToggle={() => { setMoreOpenMobile(false); handleOptimizePrompt(); }} 
                      />
                    )}
                    {/* Arena Toggle */}
                    {onToggleArena && (
                      <MobileActionBtn 
                        icon={Swords} 
                        active={arenaMode} 
                        label="ساحة المقارنة" 
                        onToggle={() => { setMoreOpenMobile(false); onToggleArena(); }} 
                      />
                    )}
                    {/* Voice Toggle */}
                    <MobileActionBtn 
                      icon={isListening ? MicOff : Mic} 
                      active={isListening} 
                      label={isListening ? 'إيقاف الإملاء' : 'الإملاء الصوتي'} 
                      onToggle={() => { setMoreOpenMobile(false); toggleVoiceInput(); }} 
                    />
                    <hr className="border-line my-1" />
                    {/* New Chat */}
                    <MobileActionBtn 
                      icon={Plus} 
                      label="محادثة جديدة" 
                      onToggle={() => { setMoreOpenMobile(false); onSend(); }} 
                    />
                    {/* Clear Context */}
                    <MobileActionBtn 
                      icon={X} 
                      destructive
                      label="مسح السياق" 
                      onToggle={() => { setMoreOpenMobile(false); setInput(''); }} 
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Hints - Desktop Only, Subtle */}
      <div id="composer-hints" className="hidden sm:flex mx-4 mt-2 px-3 py-1.5 text-[10px] text-faint flex items-center justify-center gap-3 border-t border-line/30 rounded-b-3xl bg-surface/30 backdrop-blur-sm" aria-hidden="true">
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Enter</Kbd><span>إرسال</span></span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Shift</Kbd>+<Kbd>Enter</Kbd><span>سطر جديد</span></span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Ctrl</Kbd>+<Kbd>K</Kbd><span>موديلات</span></span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Shift</Kbd>+<Kbd>P</Kbd><span>تحسين</span></span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Ctrl</Kbd>+<Kbd>U</Kbd><span>إرفاق</span></span>
        <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg"><Kbd>Esc</Kbd><span>إغلاق</span></span>
      </div>

      {/* Touch Hint */}
      <div className="sm:hidden mx-4 mt-2 px-3 py-1.5 text-[11px] text-faint text-center border-t border-line/30 rounded-b-3xl bg-surface/30 backdrop-blur-sm" aria-hidden="true">
        <span className="flex items-center justify-center gap-3">
          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg">Enter = سطر جديد</span>
          <span className="w-1 h-2 rounded bg-slate-300" />
          <span className="flex items-center gap-1.5 px-2 py-0.5 bg-surface/50 rounded-lg">زر الإرسال = إرسال</span>
        </span>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf,.txt,.md,.js,.ts,.jsx,.tsx,.py,.json,.csv"
        className="hidden"
        onChange={handleFileChange}
        multiple
      />
    </div>
  );
};

export default MijlaiComposer;