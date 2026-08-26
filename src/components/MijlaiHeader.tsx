import React, { useEffect, useState } from 'react';
import { Pencil, User, LogIn, Menu, X, Download } from 'lucide-react';
import { UserAccount } from '../types';

type ProviderOverall = 'ok' | 'degraded' | 'down' | 'unknown';

interface ProviderStatusState {
  overall: ProviderOverall;
  detail: string;
}

const STATUS_META: Record<ProviderOverall, { color: string; label: string }> = {
  ok: { color: 'bg-emerald-500', label: 'جميع المزودين يعملون' },
  degraded: { color: 'bg-amber-500', label: 'بعض المزودين متعطل — التبديل التلقائي نشط' },
  down: { color: 'bg-red-500', label: 'تعطل مؤقت للمزودين — جرّب لاحقاً' },
  unknown: { color: 'bg-slate-400', label: 'جارٍ فحص حالة المزودين...' }
};

export const MijlaiHeader: React.FC<{
  onOpenEditPrompt: () => void;
  onOpenAuthModal: () => void;
  onNewChat?: () => void;
  onExportChat?: () => void;
  currentUser: UserAccount | null;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}> = ({
  onOpenEditPrompt,
  onOpenAuthModal,
  onNewChat,
  onExportChat,
  currentUser,
  isSidebarOpen,
  onToggleSidebar
}) => {
  const [status, setStatus] = useState<ProviderStatusState>({ overall: 'unknown', detail: '' });

  // Poll provider reliability endpoint every 60s (30s server-side cache)
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/providers/status');
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        const routes = data.routes || {};
        const parts: string[] = [];
        for (const key of ['primary', 'engine', 'emergency']) {
          const r = routes[key];
          if (r) parts.push(`${r.name}: ${r.ok ? '✓' : '✗'} ${r.latency_ms}ms`);
        }
        setStatus({ overall: data.overall || 'unknown', detail: parts.join(' · ') });
      } catch { /* offline — connection banner handles it */ }
    };
    poll();
    const t = setInterval(poll, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const meta = STATUS_META[status.overall];

  return (
    <div className="absolute inset-x-0 top-0 pointer-events-none">
      {/* Menu toggle — top-left, opposite the right-side drawer so it never
          collides with the open sidebar (RTL: drawer lives on the right). */}
      <div className="absolute top-4 left-4 md:top-6 md:left-7 z-[60] pointer-events-auto">
        <button
          id="sidebar_toggle_btn"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'إغلاق الشريط الجانبي' : 'فتح الشريط الجانبي'}
          aria-expanded={isSidebarOpen}
          aria-controls="mijlai_sidebar"
          title={isSidebarOpen ? 'إغلاق الشريط الجانبي' : 'القائمة / الشريط الجانبي'}
          className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all duration-200 backdrop-blur-md active:scale-95 cursor-pointer"
        >
          {isSidebarOpen ? (
            <X className="w-4 h-4" strokeWidth={2} />
          ) : (
            <Menu className="w-4 h-4" strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Top-right actions (Provider status + Auth + Export + New Chat) */}
      <div className="absolute top-4 right-4 md:top-6 md:right-7 z-10 flex items-center gap-2.5 pointer-events-auto">
        {/* Live provider reliability indicator */}
        <span
          title={`${meta.label}${status.detail ? `\n${status.detail}` : ''}`}
          className="h-8 px-2.5 rounded-full flex items-center gap-1.5 bg-white/90 border border-slate-200/80 shadow-2xs backdrop-blur-md text-[10px] font-bold text-slate-500"
        >
          <span className={`relative flex h-2 w-2`}>
            <span className={`absolute inline-flex h-full w-full rounded-full ${meta.color} opacity-60 animate-ping`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${meta.color}`} />
          </span>
          <span className="hidden sm:inline">المزودون</span>
        </span>

        {/* Export active chat as Markdown */}
        {onExportChat && (
          <button
            id="export_chat_btn"
            onClick={onExportChat}
            title="تصدير المحادثة كملف Markdown"
            className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all duration-200 backdrop-blur-md active:scale-95 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        )}

        {/* Auth / Account Badge (Sign In for users) */}
        <button
          id="auth_account_btn"
          onClick={onOpenAuthModal}
          className={`h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-all shadow-2xs border backdrop-blur-md ${
            currentUser
              ? 'bg-blue-50/90 text-blue-700 border-blue-200/80 hover:bg-blue-100'
              : 'bg-white/90 text-slate-700 border-slate-200/80 hover:bg-white hover:text-blue-600'
          }`}
          title={currentUser ? `مسجل كـ: ${currentUser.username}` : 'تسجيل الدخول / Sign In'}
        >
          {currentUser ? (
            <>
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span className="max-w-[100px] truncate">{currentUser.username}</span>
            </>
          ) : (
            <>
              <LogIn className="w-3.5 h-3.5 text-slate-600" />
              <span>تسجيل الدخول</span>
            </>
          )}
        </button>

        {/* Sleek Smooth Top-Right Pen Icon (New Chat / Edit Prompt) */}
        <button
          id="edit_prompt_pen_btn"
          onClick={onNewChat || onOpenEditPrompt}
          className="w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-blue-600 border border-slate-200/80 shadow-2xs hover:shadow-md flex items-center justify-center transition-all duration-200 backdrop-blur-md active:scale-95 cursor-pointer"
          title="محادثة جديدة / كتابة جديدة"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
