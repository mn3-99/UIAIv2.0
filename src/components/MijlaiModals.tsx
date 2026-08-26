import React, { useState } from 'react';
import {
  X, Folder, Upload, HardDrive, LayoutGrid, Sparkles,
  Check, User, LogOut, Sliders, Shield, Globe, ChevronDown, Trash2
} from 'lucide-react';
import { useModalA11y } from '../utils/useModalA11y';
import { toast } from './Toast';

/** Close when the dimmed backdrop itself (not the dialog card) is clicked. */
const backdropClose = (onClose: () => void) => (e: React.MouseEvent<HTMLDivElement>) => {
  if (e.target === e.currentTarget) onClose();
};

/* 1. Knowledge Base Modal — RAG حقيقي (استيعاب مستندات + بحث دلالي محلي) */
export const FilesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [docs, setDocs] = useState<Array<{ id: number; name: string; chunk_count: number }>>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);

  const authHeaders = (): HeadersInit | null => {
    const token = localStorage.getItem('mijlai_auth_token');
    return token ? { Authorization: `Bearer ${token}` } : null;
  };

  const loadDocs = React.useCallback(async () => {
    const h = authHeaders();
    if (!h) return;
    try {
      const r = await fetch('/api/rag/documents', { headers: h });
      if (r.ok) setDocs((await r.json()).documents || []);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    if (isOpen) loadDocs();
  }, [isOpen, loadDocs]);

  const ingestFile = async (file: File) => {
    const h = authHeaders();
    if (!h) { setMsg('سجّل الدخول أولاً لبناء قاعدة معرفتك'); return; }
    setBusy(true); setMsg(null);
    try {
      const text = await file.text();
      const r = await fetch('/api/rag/ingest', {
        method: 'POST',
        headers: { ...h, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, text })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'فشل الاستيعاب');
      setMsg(`تم استيعاب «${file.name}» — ${d.chunks} مقطع مفهرس`);
      loadDocs();
    } catch (e: any) {
      setMsg(e.message || 'فشل الاستيعاب (الملفات النصية فقط حالياً: txt/md/csv/json/py)');
    } finally {
      setBusy(false);
    }
  };

  const deleteDoc = async (id: number) => {
    const h = authHeaders();
    if (!h) return;
    await fetch(`/api/rag/documents/${id}`, { method: 'DELETE', headers: h });
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  if (!isOpen) return null;
  const loggedIn = !!localStorage.getItem('mijlai_auth_token');

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={backdropClose(onClose)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="قاعدة المعرفة" tabIndex={-1} className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 relative animate-in fade-in zoom-in duration-200 max-h-[85vh] overflow-y-auto">
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-1">
          <Folder className="w-6 h-6 text-blue-600" />
          <h3 className="font-bold text-lg text-slate-800">قاعدة المعرفة (RAG محلي)</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
          ارفع مستندات نصية (txt / md / csv / json / py) — تُفهرس محلياً على خادمك بلا أي خدمة خارجية،
          ثم فعّل زر «مستنداتي» أثناء المحادثة ليجيب MijlAi من ملفاتك.
        </p>

        <div
          onClick={() => !busy && fileRef.current?.click()}
          className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-500 transition-colors cursor-pointer mb-3"
        >
          <Upload className={`w-8 h-8 text-blue-500 mx-auto mb-2 ${busy ? 'animate-pulse' : ''}`} />
          <div className="text-sm font-semibold text-slate-700">
            {busy ? 'جاري الفهرسة…' : 'اسحب ملفاً نصياً أو اضغط للرفع'}
          </div>
          <div className="text-xs text-slate-400 mt-1">يتم التقطيع + التضمين (fastembed) محلياً</div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.json,.py,.js,.ts,.log"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) ingestFile(f);
          }}
        />

        {msg && (
          <div className="text-[11px] mb-3 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">{msg}</div>
        )}

        {!loggedIn ? (
          <div className="text-[11px] text-slate-400">سجّل الدخول لاستخدام قاعدة المعرفة الخاصة بك.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-600">مستنداتك المفهرسة ({docs.length}):</div>
            {docs.length === 0 && <div className="text-[11px] text-slate-400">لا مستندات بعد.</div>}
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-700 truncate">{d.name}</div>
                  <div className="text-[10px] text-slate-400">{d.chunk_count} مقطع</div>
                </div>
                <button
                  onClick={() => deleteDoc(d.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="حذف من قاعدة المعرفة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* 2. Gems / Custom Assistants Modal */
export const GemsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectGem?: (gemId: string | null) => void;
  activeGemId?: string | null;
}> = ({ isOpen, onClose, onSelectGem, activeGemId }) => {
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;
  const gemsList = [
    { id: 'coder', title: 'مساعد البرمجة والتكويد', desc: 'كتابة واكتشاف الأخطاء البرمجية بلغات متعددة', color: 'bg-blue-500' },
    { id: 'writer', title: 'مساعد الكتابة الإبداعية', desc: 'صياغة المقالات، السير الذاتية، والإيميلات الاحترافية', color: 'bg-emerald-500' },
    { id: 'analyst', title: 'محلل البيانات و الإحصاء', desc: 'تحليل الجداول الجاهزة واستخراج الأفكار الرئيسية', color: 'bg-purple-500' },
    { id: 'translator', title: 'مساعد الترجمة الفورية', desc: 'ترجمة دقيقة تحافظ على سياق المعنى الأصلي', color: 'bg-amber-500' }
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={backdropClose(onClose)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="شخصيات MijlAi" tabIndex={-1} className="bg-white rounded-3xl w-full max-w-xl shadow-2xl p-6 relative">
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid className="w-6 h-6 text-purple-600" />
          <h3 className="font-bold text-lg text-slate-800">إضافات Mijlai Gems الجاهزة</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          {gemsList.map((g) => {
            const isActive = activeGemId === g.id;
            return (
              <button
                key={g.id}
                onClick={() => { onSelectGem?.(isActive ? null : g.id); onClose(); }}
                className={`text-right border rounded-2xl p-4 hover:shadow-md transition-all cursor-pointer ${
                  isActive ? 'border-purple-500 bg-purple-50/60 shadow-sm' : 'border-slate-200 hover:border-purple-300 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl ${g.color} text-white flex items-center justify-center mb-2 font-bold text-xs`}>
                  ✦
                </div>
                <div className="font-bold text-xs text-slate-800 mb-1 flex items-center gap-1.5">
                  {g.title}
                  {isActive && <Check className="w-3.5 h-3.5 text-purple-600" />}
                </div>
                <div className="text-[11px] text-slate-500 leading-snug">{g.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">اختيار شخصية يطبّق تعليماتها التخصصية على المحادثة الحالية فوراً.</p>
      </div>
    </div>
  );
};

/* 3. Pro Subscription Modal */
export const UpgradeModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={backdropClose(onClose)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="الترقية إلى Pro" tabIndex={-1} className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 relative">
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center py-2 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-2">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-xl text-slate-900">Mijlai Pro</h3>
          <p className="text-xs text-slate-500">احصل على سرعة غير محدودة، أولوية المعالجة، ونماذج التفكير المعقدة</p>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-right text-xs space-y-2 text-slate-700">
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>وصول كامل لنماذج Thinking و Pro</span></div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>رفع ملفات غير محدود بحد أقصى 2GB</span></div>
            <div className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>دعم Canvas التفاعلي المتطور</span></div>
          </div>
          <button
            onClick={() => {
              toast.success('شكراً لاهتمامك! باقة Pro ستتوفر قريباً — كل المزايا الحالية مجانية بالكامل حالياً 🎉');
              onClose();
            }}
            className="w-full bg-[#1a73e8] hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-md"
          >
            اشترك الآن بـ $19/شهرياً
          </button>
        </div>
      </div>
    </div>
  );
};

/* 4. Prompt Edit / Style Customization Modal */
export const PromptEditModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  customPrompt: string;
  onSavePrompt: (prompt: string) => void;
}> = ({ isOpen, onClose, customPrompt, onSavePrompt }) => {
  const [val, setVal] = useState(customPrompt);
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={backdropClose(onClose)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="تخصيص أسلوب الردود" tabIndex={-1} className="bg-white rounded-3xl w-full max-w-lg shadow-2xl p-6 relative">
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-base text-slate-800">تخصيص أسلوب الردود (Prompt Customization)</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3">حدد تعليمات النظام الخاصة للنموذج لتطبيقها في كافة المحادثات:</p>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="مثال: أجب دائماً باختصار وبأسلوب برمجي مباشر بلغة عربية سليمة..."
          rows={5}
          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs text-slate-800 outline-none focus:border-blue-500 resize-none leading-relaxed"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-100">إلغاء</button>
          <button
            onClick={() => {
              onSavePrompt(val);
              onClose();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
          >
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  );
};

/* 5. User Profile Modal — مع "ماذا تعرف عني؟" (الذاكرة طويلة المدى) */
export const ProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  onChangeName: (name: string) => void;
}> = ({ isOpen, onClose, userName, onChangeName }) => {
  const [nameInput, setNameInput] = useState(userName);
  const [facts, setFacts] = useState<Array<{ id: number; fact: string }>>([]);
  const [factsLoaded, setFactsLoaded] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const dialogRef = useModalA11y<HTMLDivElement>(isOpen, onClose);

  React.useEffect(() => {
    if (!isOpen) return;
    const token = localStorage.getItem('mijlai_auth_token');
    if (!token) { setFactsLoaded(true); return; }
    fetch('/api/memory/facts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : { facts: [] }))
      .then(d => { setFacts(d.facts || []); setFactsLoaded(true); })
      .catch(() => setFactsLoaded(true));
  }, [isOpen]);

  const forgetFact = async (id: number) => {
    const token = localStorage.getItem('mijlai_auth_token');
    if (!token) return;
    try {
      await fetch(`/api/memory/facts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setFacts(prev => prev.filter(f => f.id !== id));
    } catch { /* ignore */ }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onMouseDown={backdropClose(onClose)}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="الملف الشخصي" tabIndex={-1} className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6 relative text-center max-h-[88vh] overflow-y-auto">
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
        <div className="w-16 h-16 rounded-full bg-[#1e8e3e] text-white text-2xl font-bold flex items-center justify-center mx-auto mb-3 shadow-md">
          {nameInput ? nameInput.charAt(0).toUpperCase() : 'M'}
        </div>
        <h3 className="font-bold text-lg text-slate-900 mb-1">{userName}</h3>

        <div className="text-right space-y-2 mb-4 mt-3">
          <label className="text-xs font-semibold text-slate-700">تعديل الاسم المعروض:</label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
          />
        </div>

        {/* Long-term memory panel */}
        <div className="text-right mb-4">
          <button
            onClick={() => setShowFacts(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
              🧠 ماذا تعرف عني؟
              {factsLoaded && (
                <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                  {facts.length}
                </span>
              )}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFacts ? 'rotate-180' : ''}`} />
          </button>
          {showFacts && (
            <div className="mt-2 space-y-1.5 px-1">
              {!localStorage.getItem('mijlai_auth_token') ? (
                <p className="text-[11px] text-slate-400 leading-relaxed">الذاكرة طويلة المدى تحتاج تسجيل دخول — الحقائق تُستخرج تلقائياً من محادثاتك ويمكنك حذفها في أي وقت.</p>
              ) : factsLoaded && facts.length === 0 ? (
                <p className="text-[11px] text-slate-400 leading-relaxed">لا شيء بعد — كلما أخبرتني عن نفسك (اسمك، عملك، مشاريعك) سأتذكره تلقائياً في المحادثات القادمة.</p>
              ) : (
                facts.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 bg-emerald-50/60 border border-emerald-100 rounded-xl px-2.5 py-2">
                    <span className="text-[11px] text-slate-700 text-right leading-relaxed flex-1">{f.fact}</span>
                    <button
                      onClick={() => forgetFact(f.id)}
                      title="أنسَ هذه المعلومة"
                      className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              onChangeName(nameInput);
              onClose();
            }}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-xl text-xs"
          >
            حفظ
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('mijlai_auth_token');
              window.location.reload();
            }}
            className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
