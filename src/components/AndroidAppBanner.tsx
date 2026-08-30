import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Where the built APK is published. Override per-environment with VITE_APK_URL.
// Default points to the latest release asset of this repo.
const APK_URL =
  (import.meta as any).env?.VITE_APK_URL ||
  'https://raw.githubusercontent.com/mn3-99/UIAIv2.0/main/MijlAi.apk';
const DISMISS_KEY = 'mijlai_android_banner_dismissed';

/**
 * Top banner shown ONLY to Android browser visitors, suggesting they install the
 * native APK. Hidden for already-installed PWA / standalone displays and once dismissed.
 */
export const AndroidAppBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua) && !/windows phone/i.test(ua);
    const standalone =
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as any).standalone === true;
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    setShow(isAndroid && !standalone && !dismissed);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[55] bg-gradient-to-l from-blue-600 to-indigo-600 text-white shadow-lg pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] px-3">
      <div className="max-w-[820px] mx-auto flex items-center gap-2">
        <Download className="w-5 h-5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold leading-tight">حمّل تطبيق MijlAI لأندرويد</div>
          <div className="text-[11px] opacity-90 leading-tight">تجربة أسرع مع تشغيل من الشاشة الرئيسية</div>
        </div>
        <a
          href={APK_URL}
          download
          className="shrink-0 px-3 py-1.5 rounded-full bg-white text-blue-700 text-[12px] font-bold hover:bg-blue-50 transition-colors"
        >
          تحميل APK
        </a>
        <button
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setShow(false);
          }}
          aria-label="إغلاق"
          className="shrink-0 p-1 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
