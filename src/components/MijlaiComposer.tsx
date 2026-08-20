import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Plus, Mic, MicOff, ChevronDown, FileText, Image,
  HardDrive, Camera, Send, Sparkles, Brain, Zap, Square,
  Globe, SlidersHorizontal, ArrowUpRight, GripHorizontal, Cpu, Code, CornerDownLeft, Wand2
} from 'lucide-react';
import { generateCompletions } from '../utils/completions';

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
  webSearchEnabled?: boolean;
  setWebSearchEnabled?: (val: boolean) => void;
  localModels?: Array<{ id: string; name: string }>;
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
  webSearchEnabled = false,
  setWebSearchEnabled,
  localModels = []
}) => {
  const [isAttachOpen, setIsAttachOpen] = useState(false);
  const [isTierOpen, setIsTierOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

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

  // Intelligent Prompt Optimizer / Enhancer
  const handleOptimizePrompt = () => {
    if (!input.trim()) return;
    setIsOptimizing(true);

    setTimeout(() => {
      const raw = input.trim();
      let enhanced = raw;

      if (!raw.includes("بشكل مفصل") && !raw.includes("خطوات")) {
        enhanced = `يرجى إجابة السؤال التالي بأسلوب دقيق، مدمج ومنظم مع نقاط واضحة وأمثلة عملية:\n\n"${raw}"\n\nتنبيه: قم بالتنظيم بأسلوب سلس مع مراعاة اللغة العربية الدقيقة وشرح الخطوات الأساسية بشكل وافٍ.`;
      } else {
        enhanced = `[تحسين MijlAI الذكي]:\n${raw}\n\nيرجى دعم الإجابة بأمثلة وعرض المعلومات في هيئة جداول أو نقاط مرتبة حسب الأهمية.`;
      }

      setInput(enhanced);
      setIsOptimizing(false);
    }, 400);
  };

  // Speech-To-Text Handler
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
      alert('خاصية تحويل الصوت إلى نص غير مدعومة في متصفحك الحالي.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInput(transcript);
        }
      };

      recognition.onerror = () => {
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
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

  const verifiedModelsMap: Record<string, { label: string; shortName: string; icon: any; color: string; desc: string }> = {
    'flash': { label: 'Gemini (Fast)', shortName: 'Flash', icon: Zap, color: 'text-amber-500', desc: 'سريع وموفر للردود اليومية الفورية' },
    'pro': { label: 'GPT-4', shortName: 'Pro', icon: Sparkles, color: 'text-blue-600', desc: 'أذكى وأدق للمهام والتحليلات المعقدة' },
    'thinking': { label: 'Gemini 3.5 Flash', shortName: 'Thinking', icon: Brain, color: 'text-purple-600', desc: 'تفكير منطقي وعميق خطوة بخطوة' },
    'claude': { label: 'Command A', shortName: 'Command', icon: Sparkles, color: 'text-amber-600', desc: 'ممتاز في الكتابة الأكاديمية وصياغة النصوص' },
    'deepseek': { label: 'Gemini Auto', shortName: 'Auto', icon: Brain, color: 'text-emerald-600', desc: 'اختيار تلقائي لأفضل نموذج' },
    'kimi': { label: 'Aria', shortName: 'Aria', icon: Sparkles, color: 'text-indigo-600', desc: 'كشط ومعالجة مستندات طويلة المدى' },
    'qwen': { label: 'Gemini 3.6 Flash', shortName: 'Direct', icon: Code, color: 'text-cyan-600', desc: 'أحدث نسخة مباشرة من جيميني' }
  };

  const isLocalTier = selectedTier.startsWith('local:');
  const localModelName = localModels.find((m) => m.id === selectedTier)?.name;
  const currentTier = isLocalTier
    ? { label: localModelName || 'نموذج محلي', shortName: 'محلي', icon: Cpu, color: 'text-emerald-600', desc: 'نموذج llama.cpp محلي — خاص وبدون إنترنت' }
    : (verifiedModelsMap[selectedTier] || verifiedModelsMap['flash']);

  return (
    <div className="w-full max-w-[760px] md:w-[75%] mx-auto relative select-none px-2">
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

      {/* Main Interactive Input Card */}
      <div className={`w-full bg-white/95 rounded-3xl border transition-all duration-200 group relative flex flex-col shadow-md hover:shadow-xl ${
        isDragging ? 'border-blue-500 shadow-blue-100 ring-2 ring-blue-200' : 'border-slate-200/90'
      }`}>

        {/* Top Dynamic Height Drag Handle Bar */}
        <div
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
          className="w-full h-3 cursor-row-resize flex items-center justify-center hover:bg-slate-100/80 rounded-t-3xl transition-colors group/drag py-1"
          title="اسحب لأعلى أو لأسفل لتوسيع أو تصغير مربع الكتابة"
        >
          <GripHorizontal className="w-5 h-3 text-slate-300 group-hover/drag:text-slate-500 transition-colors" />
        </div>

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
                  id="google_drive"
                  onClick={() => {
                    alert('جاري الاتصال بالسحابة وسحب المستندات...');
                    setIsAttachOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right transition-colors"
                >
                  <HardDrive className="w-4 h-4 text-amber-500" />
                  <span>Google Drive / Cloud Storage</span>
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
                    if (onGenerateImage && input.trim()) {
                      onGenerateImage(input.trim());
                    } else if (onGenerateImage) {
                      // If no input, prompt user
                      const prompt = prompt('أدخل وصف الصورة المراد توليدها:');
                      if (prompt && prompt.trim()) {
                        onGenerateImage(prompt.trim());
                      }
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
            className="flex-1 bg-transparent outline-none border-none text-[15px] md:text-[16px] text-slate-800 placeholder:text-slate-400 font-normal px-2 py-2 resize-none overflow-y-auto leading-relaxed"
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
          </div>

          {/* Right Controls: Model Selector Badge & Voice / Send */}
          <div className="flex items-center gap-1">
            
            {/* Model Tier Dropdown */}
            <div className="relative">
              <button
                id="model_selector"
                onClick={() => setIsTierOpen(!isTierOpen)}
                className="h-8 px-2.5 rounded-full flex items-center gap-1.5 text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200/60 bg-slate-50/50"
                title="اختر النموذج الفعال"
              >
                <span className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 text-[10px]">✦</span>
                </span>
                <span className="text-xs font-semibold">{currentTier.shortName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
              </button>

              {isTierOpen && (
                <div className="absolute left-0 bottom-10 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 space-y-1 z-50 text-right animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[11px] font-bold text-slate-400">نماذج MijlAI المتاحة بضمان 100%</div>
                  {Object.entries(verifiedModelsMap).map(([key, item]) => {
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
                        <div>
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[10px] text-slate-500 font-normal">{item.desc}</div>
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

            {/* Send / Stop Button */}
            {isGenerating ? (
              <button
                onClick={onStop}
                className="w-8 h-8 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 transition-colors shadow-sm"
                title="إيقاف التوليد"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              input.trim() && (
                <button
                  id="send_btn"
                  onClick={onSend}
                  className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors shadow-sm"
                  title="إرسال"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
