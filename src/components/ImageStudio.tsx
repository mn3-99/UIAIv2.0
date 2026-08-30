import React, { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Loader2, Download, Sparkles, Zap, Crown, Gauge } from 'lucide-react';
import { EkgSignature } from './WaitingAnimations';
import { toast } from './Toast';

interface ImageModelInfo {
  id: string;
  label: string;
  tier: 'pro' | 'standard' | 'fast';
  avgSeconds?: number;
  provider?: string;
  requiresKey?: boolean;
  keyConfigured?: boolean;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  model: string;
  label: string;
  provider?: string;
  elapsed_ms: number;
  width?: number;
  height?: number;
  fallback?: boolean;
}

const ASPECT_RATIOS = [
  { id: '1:1', label: 'مربع', w: 1024, h: 1024 },
  { id: '16:9', label: 'أفقي', w: 1344, h: 768 },
  { id: '9:16', label: 'عمودي', w: 768, h: 1344 },
  { id: '4:3', label: '4:3', w: 1152, h: 896 },
  { id: '3:4', label: '3:4', w: 896, h: 1152 },
];

interface ImageStudioProps {
  isOpen: boolean;
  onClose: () => void;
  chatId?: string;
}

const TIER_BADGE: Record<string, { label: string; icon: React.ComponentType<any>; cls: string }> = {
  pro: { label: 'احترافي', icon: Crown, cls: 'bg-amber-100 text-amber-700' },
  standard: { label: 'قياسي', icon: Gauge, cls: 'bg-sky-100 text-sky-700' },
  fast: { label: 'سريع', icon: Zap, cls: 'bg-emerald-100 text-emerald-700' },
};

/**
 * استوديو الصور — يُفتح من الشريط الجانبي.
 * يولّد عبر طبقة النماذج الموثقة فقط (كل نموذج اجتاز اختبار 5/5 صور حقيقية).
 * المفاتيح لا تغادر السيرفر: كل الطلبات تمر عبر /api/image/v2/*.
 */
export const ImageStudio: React.FC<ImageStudioProps> = ({ isOpen, onClose, chatId }) => {
  const [models, setModels] = useState<ImageModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [aspect, setAspect] = useState(ASPECT_RATIOS[0]);
  const [negativePrompt, setNegativePrompt] = useState('');
  const [seed, setSeed] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingModels(true);
    fetch('/api/image/v2/models')
      .then(r => r.json())
      .then(d => {
        const list: ImageModelInfo[] = d.models || [];
        setModels(list);
        if (list.length && !selectedModel) setSelectedModel(list[0].id);
      })
      .catch(() => toast.error('تعذر تحميل نماذج الصور'))
      .finally(() => setLoadingModels(false));
    setTimeout(() => inputRef.current?.focus(), 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleGenerate = async () => {
    const p = prompt.trim();
    if (!p || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/image/v2/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p,
          model: selectedModel,
          width: aspect.w,
          height: aspect.h,
          negativePrompt,
          seed: seed.trim() ? parseInt(seed, 10) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `فشل التوليد (${res.status})`);
      setImages(prev => [{
        id: `img-${Date.now()}`,
        url: data.url,
        prompt: p,
        model: data.model,
        label: data.label,
        provider: data.provider,
        elapsed_ms: data.elapsed_ms,
        width: data.width,
        height: data.height,
        fallback: data.fallback,
      }, ...prev]);
      // Area 3: save to media memory for cumulative editing ("edit the previous image")
      if (chatId) {
        fetch('/api/media/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            url: data.url,
            prompt: p,
            model: data.model,
            seed: data.seed,
            provider: data.provider,
          }),
        }).catch(() => {});
      }
      if (data.fallback) {
        toast.error(`المزوّد المفضّل غير متاح — تم التوليد عبر «${data.label}» (مجاني)`);
      } else {
        toast.success(`تم التوليد في ${(data.elapsed_ms / 1000).toFixed(1)} ثانية`);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل توليد الصورة');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="استوديو الصور"
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <ImagePlus className="w-4.5 h-4.5 text-indigo-600" />
            استوديو الصور
            <span className="text-[10px] font-semibold text-slate-400">نماذج موثقة 5/5</span>
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Prompt + controls */}
        <div className="px-5 pt-4 space-y-3">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder="صف الصورة التي تريدها… مثال: قطة كرتونية بنظارة شمسية بأسلوب مسطح"
            rows={2}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
          />

          {/* Model picker */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            {loadingModels && <span className="text-[11px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> تحميل النماذج…</span>}
            {!loadingModels && models.map(m => {
              const tier = TIER_BADGE[m.tier] || TIER_BADGE.standard;
              const TierIcon = tier.icon;
              const active = selectedModel === m.id;
              const keyMissing = m.requiresKey && m.keyConfigured === false;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`shrink-0 h-8 px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold border transition-all duration-200 active:scale-95 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                  }`}
                  title={m.avgSeconds ? `متوسط التوليد: ${m.avgSeconds} ثانية` : undefined}
                >
                  <TierIcon className={`w-3.5 h-3.5 ${active ? 'text-white' : ''}`} />
                  {m.label}
                  {keyMissing && <span className="text-[9px] text-amber-500" title="يحتاج مفتاح خادم — سيعود تلقائياً للمجاني">🔑</span>}
                </button>
              );
            })}
          </div>

          {/* Aspect ratio */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ASPECT_RATIOS.map(a => {
              const active = aspect.id === a.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAspect(a)}
                  className={`h-7 px-2.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    active ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {a.label} <span className="opacity-60">{a.id}</span>
                </button>
              );
            })}
            <button
              onClick={() => setShowAdvanced(v => !v)}
              className="h-7 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-700 transition-all"
            >
              {showAdvanced ? 'إخفاء المتقدّم' : 'متقدّم'}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <input
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="وصف سلبي (ما تريد تجنّبه): تشوّه، أطراف زائدة، جودة رديئة…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex items-center gap-2">
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="بذرة عشوائية (اختياري — لنتيجة ثابتة)"
                  inputMode="numeric"
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <button
                  onClick={() => setSeed(String(Math.floor(Math.random() * 2_147_483_647)))}
                  className="h-9 px-3 rounded-xl text-[11px] font-semibold border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-700"
                  title="بذرة عشوائية"
                >
                  🎲
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim() || !selectedModel}
            className="w-full h-11 rounded-2xl bg-gradient-to-l from-indigo-600 to-purple-600 text-white text-sm font-bold hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 transition-all active:scale-[0.99] flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isGenerating ? 'يولّد الصورة…' : 'توليد الصورة'}
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isGenerating && (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <EkgSignature />
              <span className="text-[11px] text-slate-400 font-semibold">يُرسم الآن بريشة MijlAI…</span>
            </div>
          )}
          {!isGenerating && images.length === 0 && (
            <div className="text-center py-12 text-slate-300">
              <ImagePlus className="w-10 h-10 mx-auto mb-2" />
              <p className="text-xs text-slate-400">صورك المولّدة ستظهر هنا</p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map(img => (
              <figure key={img.id} className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 animate-in fade-in zoom-in-95 duration-300">
                <img src={img.url} alt={img.prompt} loading="lazy" className="w-full aspect-square object-cover" />
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5 pt-6">
                  <p className="text-[10px] text-white/90 truncate" title={img.prompt}>{img.prompt}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-white/70">{img.label} · {(img.elapsed_ms / 1000).toFixed(1)}ث{img.fallback ? ' · احتياطي' : ''}</span>
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white transition-colors"
                      title="فتح/تنزيل الصورة"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
