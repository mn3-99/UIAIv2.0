import React from 'react';
import { Sparkles, Layers, ListOrdered, Wand2, ArrowLeft } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ONBOARDING_KEY = 'mijlai_onboarded_v1';

export function isOnboardingDone(): boolean {
  try { return !!localStorage.getItem(ONBOARDING_KEY); } catch { return true; }
}

export function markOnboardingDone(): void {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* private mode */ }
}

const POINTS = [
  { icon: Layers, title: 'اختر نموذجك', desc: 'من زر النموذج أسفل حقل الكتابة — Mini للسرعة أو Pro للجودة' },
  { icon: Wand2, title: 'فعّل المهارات', desc: 'الشريط السفلي يحمل مهارات جاهزة، و"صانع المهارات" يبني لك مهارة من كلمات' },
  { icon: ListOrdered, title: 'أرسل بلا انتظار', desc: 'أرسل عدة رسائل أثناء الرد — الطابور الذكي يجيب عليها بالتسلسل' },
];

/**
 * رسالة ترحيب بسيطة — تظهر مرة واحدة فقط للمستخدم الجديد.
 * خفيفة: بلا مكتبات، بلا طلبات شبكة.
 */
export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleStart = () => {
    markOnboardingDone();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleStart}
      role="dialog"
      aria-modal="true"
      aria-label="ترحيب"
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 animate-in zoom-in-95 duration-200"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/25">
          <Sparkles className="w-6 h-6 text-white" strokeWidth={2} />
        </div>

        <h2 className="text-lg font-bold text-slate-800 text-center mb-1">أهلاً بك في MijlAi</h2>
        <p className="text-xs text-slate-500 text-center mb-5">ثلاث خطوات وتنطلق:</p>

        <div className="space-y-3 mb-6">
          {POINTS.map((p, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                <p.icon className="w-4 h-4 text-blue-600" strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">{p.title}</div>
                <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleStart}
          className="w-full h-11 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 text-white text-sm font-bold hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-[0.98] shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
        >
          ابدأ الآن
          <ArrowLeft className="w-4 h-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};
