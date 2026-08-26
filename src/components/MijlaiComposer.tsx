import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Mic, MicOff, ChevronDown, FileText, Image,
  Camera, Send, Sparkles, Brain, Zap, Square,
  Globe, GripHorizontal, Cpu, Code, CornerDownLeft, Wand2,
  X, Loader2, Swords, Rocket
} from 'lucide-react';
import { generateCompletions } from '../utils/completions';
import { BookOpen } from 'lucide-react';
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
  /** Arena mode (side-by-side model comparison) */
  arenaMode?: boolean;
  onToggleArena?: () => void;
  arenaModelA?: string;
  arenaModelB?: string;
  onSelectArenaModel?: (side: 'a' | 'b', tier: string) => void;
  onGenerateImage?: (prompt: string) => void;
  webSearchEnabled?: boolean;
  setWebSearchEnabled?: (val: boolean) => void;
  knowledgeEnabled?: boolean;
  setKnowledgeEnabled?: (val: boolean) => void;
  localModels?: Array<{ id: string; name: string }>;
  attachments?: Array<{ id: string; name: string; url: string; mime: string; size?: number }>;
  onRemoveAttachment?: (id: string) => void;
  isUploading?: boolean;
  /** شريط المهارات والإضافات — يُعرض أسفل حقل الكتابة */
  skillsBar?: React.ReactNode;
  /** عدد الرسائل المنتظرة في الطابور */
  queueCount?: number;
}

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
  webSearchEnabled = false,
  setWebSearchEnabled,
  knowledgeEnabled = false,
  setKnowledgeEnabled,
  localModels = [],
  attachments = [],
  onRemoveAttachment,
  isUploading = false,
  arenaMode = false,
  onToggleArena,
  arenaModelA = 'flash',
  arenaModelB = 'pro',
  onSelectArenaModel,
  skillsBar,
  queueCount = 0
}) => {
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isTierOpen, setIsTierOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  // True while a file is being dragged over the composer (drop-to-attach)
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragDepthRef = useRef(0);

  // Streaming prediction suggestions (shown while typing, accept with Tab or click)
  const suggestions = useMemo(() => {
    if (isGenerating || !input.trim()) return [];
    return generateCompletions(input);
  }, [input, isGenerating]);
  
  // Custom flexible height state for dragging / manual resizer
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef<number>(0);
  const initialHeight = useRef<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);
  const composerRootRef = useRef<HTMLDivElement>(null);
  // Snapshot of the input taken when dictation starts, so interim results
  // are inserted at the cursor instead of wiping everything the user typed.
  const voiceBaseRef = useRef<{ before: string; after: string } | null>(null);

  // Close any open dropdown (attach menu / model picker) when clicking outside
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (composerRootRef.current && !composerRootRef.current.contains(e.target as Node)) {
        setIsAttachOpen(false);
        setIsTierOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // Auto-resize textarea when typing unless user manually dragged height
  useEffect(() => {
    if (textareaRef.current && !composerHeight) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 44), 260)}px`;
    }
  }, [input, composerHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Accept first suggestion with Tab (streaming prediction)
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      setInput(suggestions[0].text);
      return;
    }
    // Escape dismisses open menus first (before bubbling to app-level handlers)
    if (e.key === 'Escape') {
      if (isAttachOpen || isTierOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsAttachOpen(false);
        setIsTierOpen(false);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isGenerating) {
        onSend();
      }
    }
  };

  // Drag resizer handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    if (textareaRef.current) {
      initialHeight.current = textareaRef.current.clientHeight;
    }
  };

  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = dragStartY.current - clientY; // Dragging UP increases height
      const newHeight = Math.min(Math.max(initialHeight.current + deltaY, 50), 380);
      setComposerHeight(newHeight);
    };

    const handleDragEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchend', handleDragEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [isDragging]);

  // Intelligent Prompt Optimizer — REAL AI call to the server-side prompt
  // engineering endpoint (POST /api/prompt/enhance). Falls back gracefully to a
  // local structural template when the enhancer is unreachable.
  const handleOptimizePrompt = async () => {
    const raw = input.trim();
    if (!raw || isOptimizing) return;
    setIsOptimizing(true);

    try {
      const res = await fetch('/api/prompt/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: raw })
      });
      if (!res.ok) throw new Error(`enhance failed: ${res.status}`);
      const data = await res.json();
      const enhanced = String(data?.enhanced || '').trim();
      if (!enhanced) throw new Error('empty enhancement');
      setInput(enhanced);
      toast.success('تم تحسين الأمر بالذكاء الاصطناعي ✨');
    } catch {
      // Offline/degraded fallback: local structural wrap (better than nothing)
      setInput(`أجب على الطلب التالي بأسلوب دقيق ومنظم مع نقاط واضحة وأمثلة عملية:\n\n"${raw}"`);
      toast.info('تعذر الوصول لمحسّن الذكاء الاصطناعي — طُبّق قالب محسّن محلي');
    } finally {
      setIsOptimizing(false);
      textareaRef.current?.focus();
    }
  };

  // Speech-To-Text Handler — dictation is inserted at the cursor position and
  // never destroys existing text (interim results rewrite only the dictated part).
  const toggleVoiceInput = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('خاصية الإملاء الصوتي غير مدعومة في هذا المتصفح — جرّب Chrome أو Edge');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        // Snapshot current text + cursor so dictation splices in cleanly
        const ta = textareaRef.current;
        const pos = ta ? (ta.selectionStart ?? ta.value.length) : input.length;
        voiceBaseRef.current = { before: input.slice(0, pos), after: input.slice(pos) };
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript && voiceBaseRef.current) {
          const base = voiceBaseRef.current;
          setInput(base.before + transcript + base.after);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
        toast.warning('تعذّر التعرف على الصوت — تحقق من صلاحيات الميكروفون');
      };

      recognition.onend = () => {
        setIsRecording(false);
        voiceBaseRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Voice input error:', err);
      setIsRecording(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAttachFile(e.target.files[0]);
    }
    setIsAttachOpen(false);
  };

  const verifiedModelsMap: Record<string, { label: string; shortName: string; icon: any; color: string; desc: string; realModel: string; badge: string }> = {
    'mini': {
      label: 'MijlAi Mini', shortName: 'Mini', icon: Zap, color: 'text-emerald-600',
      desc: 'خفيف وسريع التدفق — للمهام اليومية الفورية',
      realModel: 'GPT-Mini · Yqcloud', badge: '⚡ 198 توكن/ث · موثوقية 100%'
    },
    'flash': {
      label: 'MijlAi Flash', shortName: 'Flash', icon: Sparkles, color: 'text-amber-500',
      desc: 'أسرع بداية رد يومي بتوازن ممتاز',
      realModel: 'Sonar · Perplexity', badge: '⏱ 1.9ث أول توكن · موثوقية 100%'
    },
    'pro': {
      label: 'MijlAi Pro', shortName: 'Pro', icon: Brain, color: 'text-purple-600',
      desc: 'الأقوى في التحليل والاستدلال والمهام المعقدة',
      realModel: 'Gemini · Google', badge: '★ 158 توكن/ث · جودة قصوى'
    },
    'coder': {
      label: 'MijlAi Coder', shortName: 'Coder', icon: Code, color: 'text-cyan-600',
      desc: 'متخصص برمجياً — أسرع استجابة مقياسة (0.4ث)',
      realModel: 'Qwen3-Coder-30B · OVHcloud', badge: '🚀 0.4ث أول توكن · 75 توكن/ث'
    },
    'pwr': {
      label: 'MijlAI-PWR', shortName: 'PWR', icon: Rocket, color: 'text-rose-600',
      desc: 'وكيل MijlAI المخصص على DigitalOcean — نموذجك الخاص',
      realModel: 'MijlAI-PWR · DigitalOcean', badge: '🛡 وكيل مخصص · حصري'
    }
  };

  const isLocalTier = selectedTier.startsWith('local:');
  const localModelName = localModels.find((m) => m.id === selectedTier)?.name;
  const currentTier = isLocalTier
    ? { label: localModelName || 'نموذج محلي', shortName: 'محلي', icon: Cpu, color: 'text-emerald-600', desc: 'نموذج llama.cpp محلي — خاص وبدون إنترنت' }
    : (verifiedModelsMap[selectedTier] || verifiedModelsMap['flash']);

  // Arena helpers: resolve any tier id (incl. local:) to a short display name
  const arenaTierShort = (tier: string) =>
    verifiedModelsMap[tier]?.shortName
    || (tier.startsWith('local:') ? (localModels.find((m) => m.id === tier)?.name || 'محلي') : tier);
  const [arenaPickerOpen, setArenaPickerOpen] = useState<'a' | 'b' | null>(null);
  const arenaTierList = useMemo(
    () => [
      ...Object.keys(verifiedModelsMap),
      ...localModels.map((m) => m.id)
    ],
    [localModels]
  );

  return (
    <div ref={composerRootRef} className="w-full max-w-[760px] md:w-[75%] mx-auto relative select-none px-2">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Main Interactive Input Card — also a drop target for files */}
      <div
        className={`w-full bg-white/95 rounded-3xl border transition-all duration-300 group relative flex flex-col shadow-md hover:shadow-xl hover-lift ${
          isDropTarget
            ? 'border-blue-500 ring-4 ring-blue-300/50 shadow-xl scale-[1.01] glow-blue'
            : isDragging
              ? 'border-blue-500 shadow-blue-100 ring-2 ring-blue-200'
              : 'border-slate-200/90'
        }`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes('Files')) {
            dragDepthRef.current += 1;
            setIsDropTarget(true);
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDropTarget(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragDepthRef.current = 0;
          setIsDropTarget(false);
          const files: File[] = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
          if (files.length > 0) {
            files.slice(0, 4).forEach((f: File) => onAttachFile(f));
            toast.success(files.length > 1 ? `جاري إرفاق ${files.length} ملفات…` : `جاري إرفاق «${files[0].name}»…`);
          }
        }}
      >
        {/* Drop overlay hint */}
        {isDropTarget && (
          <div className="absolute inset-0 z-10 rounded-3xl bg-blue-50/80 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
            <span className="text-sm font-bold text-blue-700">أفلت الملف هنا لإرفاقه 📎</span>
          </div>
        )}

        {/* Top Dynamic Height Drag Handle Bar */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="w-full h-3 cursor-row-resize flex items-center justify-center hover:bg-slate-100/80 rounded-t-3xl transition-colors group/drag py-1"
          title="اسحب لأعلى أو لأسفل لتوسيع أو تصغير مربع الكتابة"
        >
          <GripHorizontal className="w-5 h-3 text-slate-300 group-hover/drag:text-slate-500 transition-colors" />
        </div>

        {/* Attachment chips (uploaded files awaiting send) */}
        {(attachments.length > 0 || isUploading) && (
          <div className="mx-3 mb-1 flex flex-wrap items-center gap-1.5">
            {attachments.map(a => (
              <span key={a.id} className="group relative flex items-center gap-1.5 px-2 py-1 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-600 max-w-[220px]">
                {a.mime.startsWith('image/') && (
                  <img src={a.url} alt={a.name} className="w-5 h-5 rounded object-cover shrink-0" />
                )}
                <span className="truncate">{a.name}</span>
                {onRemoveAttachment && (
                  <button
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`إزالة ${a.name}`}
                    className="shrink-0 p-0.5 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {isUploading && (
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-blue-200 bg-blue-50 text-[11px] text-blue-600">
                <Loader2 className="w-3 h-3 animate-spin" /> جاري الرفع...
              </span>
            )}
          </div>
        )}

        {/* Main Input Textarea Container */}
        <div className="px-3 pt-1 pb-2 flex items-stretch gap-2">
          
          {/* Attachment (+) Button & Menu */}
          <div className="relative self-end mb-1">
            <button
              id="attachment_menu"
              onClick={() => setIsAttachOpen(!isAttachOpen)}
              className="w-10 h-10 min-w-[40px] rounded-full flex items-center justify-center text-[#5f6368] hover:bg-[#f1f3f4] transition-colors ml-0.5"
              title="إرفاق ملف أو وسائط"
            >
              <Plus className="w-5 h-5" strokeWidth={2} />
            </button>

            {isAttachOpen && (
              <div className="absolute right-0 bottom-12 w-60 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 space-y-1 z-50 text-xs font-medium text-slate-700 animate-in fade-in zoom-in-95 duration-150">
                <button
                  id="upload_file"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right transition-colors"
                >
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>رفع مستند أو ملف</span>
                </button>

                <button
                  id="upload_image"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right transition-colors"
                >
                  <Image className="w-4 h-4 text-emerald-600" />
                  <span>رفع صورة لتحليلها</span>
                </button>

                <button
                  id="camera"
                  onClick={() => {
                    if (imageInputRef.current) {
                      imageInputRef.current.setAttribute('capture', 'environment');
                      imageInputRef.current.click();
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right transition-colors"
                >
                  <Camera className="w-4 h-4 text-purple-600" />
                  <span>التقاط صورة مباشرة</span>
                </button>

                <button
                  id="generate_image"
                  onClick={() => {
                    setIsAttachOpen(false);
                    if (input.trim()) {
                      onGenerateImage?.(input.trim());
                    } else {
                      // No description yet — guide the user instead of a blocking prompt()
                      setInput('توليد صورة: ');
                      toast.info('اكتب وصف الصورة التي تريدها ثم أرسلها للتوليد');
                      requestAnimationFrame(() => {
                        const ta = document.getElementById('main_input') as HTMLTextAreaElement | null;
                        ta?.focus();
                        if (ta) ta.setSelectionRange(ta.value.length, ta.value.length);
                      });
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right transition-colors"
                >
                  <Wand2 className="w-4 h-4 text-pink-600" />
                  <span>توليد صورة بالذكاء الاصطناعي</span>
                </button>
              </div>
            )}
          </div>

          {/* Textarea */}
          <textarea
            id="main_input"
            ref={textareaRef}
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اسأل MijlAi أي شيء..."
            rows={1}
            className="flex-1 bg-transparent outline-none border-none text-[15px] md:text-[16px] text-slate-800 placeholder:text-slate-400 font-normal px-2 py-2 resize-none overflow-y-auto leading-relaxed transition-all duration-200 focus:placeholder:text-slate-300"
            style={{
              fontFamily: 'Inter, "Google Sans", sans-serif',
              height: composerHeight ? `${composerHeight}px` : undefined
            }}
          />
        </div>

        {/* Streaming Prediction Suggestions Bar */}
        {suggestions.length > 0 && (
          <div className="mx-3 mb-1 flex flex-wrap items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
            {suggestions.map((s, i) => (
              <button
                key={`${s.text}-${i}`}
                onClick={() => setInput(s.text)}
                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all bg-blue-50/70 text-blue-700 border-blue-200/70 hover:bg-blue-600 hover:text-white hover:border-blue-600"
                title={`${s.reason} — انقر للقبول`}
              >
                {i === 0 && (
                  <kbd className="hidden sm:flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold bg-blue-600/10 group-hover:bg-white/20">
                    <CornerDownLeft className="w-2.5 h-2.5" />
                  </kbd>
                )}
                <span className="max-w-[260px] truncate" dir="auto">{s.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* Live Voice Recording Soundwave Bar (Shows when mic active) */}
        {isRecording && (
          <div className="mx-4 mb-2 px-3 py-1.5 bg-red-50/80 border border-red-200/60 rounded-xl flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
              <span>جاري الاستماع لصوتك والتحويل إلى نص...</span>
            </div>
            <div className="flex items-center gap-1 h-4">
              <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-2 bg-red-500 rounded-full animate-bounce [animation-delay:300ms]" />
              <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce [animation-delay:450ms]" />
            </div>
          </div>
        )}

        {/* Bottom Toolbar & Action Bar */}
        <div className="px-3 pb-2 pt-1 border-t border-slate-100/80 flex items-center justify-between gap-1">
          
          {/* Left Controls: Web Search Grounding & Prompt Optimizer */}
          <div className="flex items-center gap-1.5">
            {/* Personal Knowledge (RAG) Toggle */}
            <button
              onClick={() => setKnowledgeEnabled?.(!knowledgeEnabled)}
              className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all ${
                knowledgeEnabled
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
              }`}
              title="الإجابة من مستنداتك المفهرسة (RAG محلي)"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">مستنداتي</span>
            </button>

            {/* Web Search Toggle Button */}
            <button
              onClick={() => setWebSearchEnabled?.(!webSearchEnabled)}
              className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all ${
                webSearchEnabled
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
              }`}
              title="تفعيل/تعطيل البحث المباشر عبر الويب"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">البحث بالويب</span>
            </button>

            {/* Prompt Enhancer / Optimizer Button */}
            {input.trim() && (
              <button
                onClick={handleOptimizePrompt}
                disabled={isOptimizing}
                className="h-8 px-2.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60 flex items-center gap-1.5 text-xs font-semibold transition-all"
                title="تحسين وتوسيع الصياغة بالذكاء الاصطناعي"
              >
                <Sparkles className={`w-3.5 h-3.5 text-amber-600 ${isOptimizing ? 'animate-spin' : ''}`} />
                <span>{isOptimizing ? 'جاري التحسين...' : 'تحسين الأمر'}</span>
              </button>
            )}

            {/* Arena Mode Toggle */}
            {onToggleArena && (
              <button
                onClick={onToggleArena}
                className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all ${
                  arenaMode
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                }`}
                title="ساحة المقارنة: أرسل السؤال لنموذجين وقارن الإجابتين جنباً إلى جنب"
                aria-pressed={arenaMode}
              >
                <Swords className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ساحة</span>
              </button>
            )}
          </div>

          {/* Right Controls: Model Selector Badge & Voice / Send */}
          <div className="flex items-center gap-1">

            {/* Arena dual pickers (replace the single tier picker in arena mode) */}
            {arenaMode && (
              <div className="flex items-center gap-1">
                {(['a', 'b'] as const).map((side) => {
                  const value = side === 'a' ? arenaModelA : arenaModelB;
                  const open = arenaPickerOpen === side;
                  return (
                    <div className="relative" key={side}>
                      <button
                        onClick={() => setArenaPickerOpen(open ? null : side)}
                        className={`h-8 px-2 rounded-full flex items-center gap-1 text-[11px] font-bold border transition-colors ${
                          side === 'a'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                        title={`نموذج ${side === 'a' ? 'الأول (أ)' : 'الثاني (ب)'} في المقارنة`}
                        aria-expanded={open}
                      >
                        <span>{side === 'a' ? 'أ' : 'ب'}: {arenaTierShort(value)}</span>
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {open && (
                        <div className="absolute left-0 bottom-10 w-56 max-h-64 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-slate-100 p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                          {arenaTierList.map((tier) => (
                            <button
                              key={tier}
                              onClick={() => { onSelectArenaModel?.(side, tier); setArenaPickerOpen(null); }}
                              className={`w-full text-right px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                value === tier ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {arenaTierShort(tier)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Model Tier Dropdown */}
            {!arenaMode && (
            <div className="relative">
              <button
                id="model_selector"
                onClick={() => setIsTierOpen(!isTierOpen)}
                className="h-8 px-2.5 rounded-full flex items-center gap-1.5 text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200/60 bg-slate-50/50"
                title="اختر النموذج الفعال"
              >
                <span className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                  <Sparkles className="w-2.5 h-2.5 text-blue-600" strokeWidth={2.4} />
                </span>
                <span className="text-xs font-semibold">{currentTier.shortName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
              </button>

              {isTierOpen && (
                <div
                  className="absolute left-0 bottom-10 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 space-y-1 z-50 text-right animate-in fade-in zoom-in-95 duration-150 overflow-y-auto scroll-smooth"
                  style={{ maxHeight: 'min(420px, 55vh)', overscrollBehavior: 'contain', scrollbarWidth: 'thin' }}
                  onWheel={(e) => {
                    const el = e.currentTarget;
                    const atTop = el.scrollTop <= 0;
                    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
                    if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) return;
                    e.stopPropagation();
                  }}
                >
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-400 sticky top-0 bg-white/90 backdrop-blur-sm">نماذج MijlAI — مُقاسة ومرتبة حسب الأداء الفعلي</div>
                  {Object.entries(verifiedModelsMap).map(([key, item], idx) => {
                    const Icon = item.icon;
                    const isSelected = selectedTier === key;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          onSelectTier(key);
                          setIsTierOpen(false);
                        }}
                        className={`w-full text-right p-2.5 rounded-xl flex items-start gap-2.5 transition-colors ${
                          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${item.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold flex items-center justify-between gap-2">
                            <span>{item.label}</span>
                            {idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold shrink-0">الأسرع تدفقاً</span>}
                            {key === 'coder' && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 font-bold shrink-0">أسرع استجابة</span>}
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal">{item.desc}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono" dir="ltr">{item.realModel}</span>
                            <span className="text-[9px] text-slate-400">{item.badge}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {localModels.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[11px] font-bold text-slate-400 border-t border-slate-100 mt-1 pt-2 flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> نماذج محلية (llama.cpp)
                      </div>
                      {localModels.map((m) => {
                        const isSelected = selectedTier === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              onSelectTier(m.id);
                              setIsTierOpen(false);
                            }}
                            className={`w-full text-right p-2.5 rounded-xl flex items-start gap-2.5 transition-colors ${
                              isSelected ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Cpu className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-emerald-500'}`} />
                            <div>
                              <div className="text-xs font-bold">{m.name}</div>
                              <div className="text-[10px] text-slate-500 font-normal">يعمل محلياً على جهازك — خصوصية كاملة</div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Mic Dictation Button */}
            <button
              id="voice_input"
              onClick={toggleVoiceInput}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                isRecording
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title={isRecording ? 'إيقاف التسجيل' : 'الإملاء الصوتي'}
            >
              {isRecording ? <MicOff className="w-4 h-4 text-red-600" /> : <Mic className="w-4 h-4" />}
            </button>

            {/* Queue counter chip — الرسائل المنتظرة في الطابور */}
            {queueCount > 0 && (
              <span
                className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/70 animate-in fade-in duration-200"
                title="رسائل في الطابور ستُرسل تلقائياً بالتسلسل"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {queueCount}
              </span>
            )}

            {/* Send / Stop Button */}
            {isGenerating ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 transition-all shadow-sm press-effect pulse-ring relative"
                title="إيقاف التوليد"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              input.trim() && (
                <button
                  id="send_btn"
                  onClick={onSend}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm press-effect scale-in-bounce glow-blue"
                  title="إرسال"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>

          {/* شريط المهارات والإضافات — أسفل حقل الكتابة، مقابل قائمة النماذج */}
          {skillsBar}
        </div>
      </div>
    </div>
  );
};
