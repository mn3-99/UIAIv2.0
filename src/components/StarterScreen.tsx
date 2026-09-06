import React from 'react';
import { BookOpen, Code, Languages, PenLine } from 'lucide-react';
import { MijlaiLogo } from './MijlaiLogo';

// Quick-start suggestions shown on the empty chat screen — one tap to a great prompt
const STARTER_PROMPTS = [
  { icon: Code, text: 'اكتب لي دالة TypeScript لإنشاء SSE stream في Express مع شرح مبسط' },
  { icon: BookOpen, text: 'اشرح لي الفرق بين REST و GraphQL بجدول مقارنة وأمثلة عملية' },
  { icon: PenLine, text: 'صغ لي رسالة بريد إلكتروني مهنية بالعربية لتقديم مشروع تقني' },
  { icon: Languages, text: 'ترجم هذه الجملة إلى الإنجليزية مع تحسين الصياغة: ...' },
];

interface StarterScreenProps {
  isGuest: boolean;
  onOpenAuth: () => void;
  /** Pick a starter prompt: fills the composer and focuses it. */
  onPickPrompt: (text: string) => void;
  /** Clicking the logo demotes to the fast tier (historical behavior). */
  onLogoClick: () => void;
  /** The hero composer — rendered inside the centered group (matches original DOM). */
  composer?: React.ReactNode;
}

/** Empty-state greeting: hero logo + guest banner + starter prompt chips + hero composer. */
export const StarterScreen: React.FC<StarterScreenProps> = React.memo(({ isGuest, onOpenAuth, onPickPrompt, onLogoClick, composer }) => (
  <div className="flex-1 flex flex-col items-center justify-center w-full px-4">
    <div className="mb-[20px] md:mb-[28px] flex flex-col items-center cursor-pointer transition-transform hover:scale-[1.01]" onClick={onLogoClick}>
      <MijlaiLogo size="hero" />
    </div>

    {/* رسالة ترحيب للزوار غير المسجلين */}
    {isGuest && (
      <div className="w-full max-w-[760px] md:w-[75%] mb-4 px-4 py-3 bg-gradient-to-r from-accent-soft/80 to-accent-soft/80 border border-accent/35 rounded-2xl text-center animate-in fade-in duration-500">
        <p className="text-[13px] text-main leading-relaxed font-medium">
          <span className="text-accent font-bold">مرحبًا بك في MijlAI.</span>{' '}
          يمكنك الآن تجربة نموذج{' '}
          <span className="text-accent font-bold">MijlAI-lalo-fast</span>{' '}
          السريع. بعد التسجيل، ستحصل على وصول كامل إلى مجموعة متنوعة من النماذج المتقدمة التي تتميز بدقة أعلى، وقدرات تخصيص أوسع، ودعم للغات متعددة، وتحليل سياقي محسن.
        </p>
        <button
          onClick={onOpenAuth}
          className="mt-2.5 inline-flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-[12px] font-bold rounded-xl shadow-sm transition-colors"
        >
          تسجيل الدخول
        </button>
      </div>
    )}

    {/* Quick-start prompt chips — lower the "blank page" barrier */}
    <div className="w-full max-w-[760px] md:w-[75%] mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {STARTER_PROMPTS.map((p, i) => {
        const Icon = p.icon;
        return (
          <button
            key={i}
            onClick={() => onPickPrompt(p.text)}
            className="group flex items-start gap-2.5 text-start p-3 bg-surface/70 hover:bg-surface border border-line/80 hover:border-accent/35 rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-sm hover:shadow-md text-xs text-muted hover:text-main"
          >
            <span className="shrink-0 w-7 h-7 rounded-xl bg-accent-soft text-accent flex items-center justify-center group-hover:bg-accent group-hover:text-white transition-colors">
              <Icon className="w-3.5 h-3.5" />
            </span>
            <span className="leading-relaxed line-clamp-2">{p.text}</span>
          </button>
        );
      })}
    </div>

    {composer}
  </div>
));
