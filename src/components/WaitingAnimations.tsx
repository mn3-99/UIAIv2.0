import React from 'react';

/**
 * حركات الانتظار — Waiting Animations
 * ===================================
 * 1) WaitingLines: حركة الثلاث خطوط (بأشكال وطرق مختلفة: pulse/wave/flow)
 * 2) EkgSignature: خط نبضات قلب يتعرّج راسماً حروف "MijlAI" بأسلوب خط الأطباء
 * 3) OrbitPulse: فكرة مبتكرة — نواة نابضة تدور حولها نقاط كمدارات ذرة
 * كلها SVG/CSS خالصة: خفيفة، بلا مكتبات، وتحترم prefers-reduced-motion.
 */

// ── 1) الثلاث خطوط بأشكال مختلفة ─────────────────────────────
export type LinesVariant = 'pulse' | 'wave' | 'flow';

export const WaitingLines: React.FC<{ variant?: LinesVariant }> = ({ variant = 'pulse' }) => {
  const lines = [
    { w: '100%', delay: 0 },
    { w: '72%', delay: variant === 'wave' ? 150 : 180 },
    { w: '45%', delay: variant === 'wave' ? 300 : 360 },
  ];
  return (
    <div className={`waiting-lines waiting-lines-${variant} space-y-2 py-2 min-w-[190px]`} aria-hidden="true">
      {lines.map((l, i) => (
        <div
          key={i}
          className="waiting-line h-[5px] rounded-full"
          style={{ width: l.w, animationDelay: `${l.delay}ms` }}
        />
      ))}
    </div>
  );
};

// ── 2) خط نبض القلب "MijlAI" بأسلوب خط الأطباء ───────────────
// مسار SVG متصل واحد: خط الأساس المسطح بين الحروف = الخط المسطح في جهاز EKG،
// وكل حرف = مجمع QRS حاد يتعرّج ليرسم الحرف بضربة قلم واحدة.
const EKG_PATH =
  'M0,32 L14,32 L18,26 L22,32 L30,32 L36,12 L42,44 L48,12 L54,32 L60,32 L64,10 L68,32 L74,32 L78,21 L82,32 L88,32 L92,22 L96,32 L100,46 L104,32 L110,32 L116,6 L122,32 L128,32 L134,10 L142,32 L150,32 L154,26 L158,32 L172,32';

export const EkgSignature: React.FC = () => (
  <div className="ekg-signature py-1.5 min-w-[190px]" role="img" aria-label="MijlAI heartbeat signature">
    <svg width="180" height="52" viewBox="0 0 172 52" fill="none" className="ekg-svg">
      <defs>
        <linearGradient id="ekgGrad" x1="0" y1="0" x2="172" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* الأثر الخافت (المسار الكامل كمرجع بصري) */}
      <path d={EKG_PATH} stroke="currentColor" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* خط الرسم النابض */}
      <path
        d={EKG_PATH}
        stroke="url(#ekgGrad)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ekg-draw"
      />
      {/* النقطة المضيئة تتبع رأس الرسم بدقة عبر animateMotion الأصلي */}
      <circle r="3.2" fill="#22d3ee" className="ekg-dot">
        <animateMotion dur="3.5s" repeatCount="indefinite" path={EKG_PATH} keyPoints="0;1;1" keyTimes="0;0.72;1" calcMode="linear" />
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.7;0.85;1" dur="3.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  </div>
);

// ── 3) نبض المدارات — فكرة مبتكرة ثانية ──────────────────────
export const OrbitPulse: React.FC = () => (
  <div className="orbit-pulse" role="img" aria-label="processing orbits">
    <div className="orbit-core" />
    <span className="orbit-dot orbit-dot-1" />
    <span className="orbit-dot orbit-dot-2" />
    <span className="orbit-dot orbit-dot-3" />
  </div>
);

/**
 * العرض الموحّد أثناء الانتظار: توقيع EKG أساساً + الثلاث خطوط تحته.
 */
export const WaitingIndicator: React.FC = () => (
  <div className="flex flex-col gap-1 py-1">
    <EkgSignature />
    <WaitingLines variant="flow" />
  </div>
);
