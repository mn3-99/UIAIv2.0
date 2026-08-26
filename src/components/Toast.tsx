import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let counter = 0;

/**
 * Lightweight global toast API (module-level emitter + <ToastHost /> renderer).
 * Usage: toast.success('تم الحفظ') / toast.error('فشل الاتصال') / toast.info(...)
 */
export const toast = {
  show(message: string, type: ToastType = 'info', duration = 3200) {
    if (!message) return;
    const item: ToastItem = { id: ++counter, message, type, duration };
    listeners.forEach((l) => l(item));
  },
  success(message: string) {
    this.show(message, 'success');
  },
  error(message: string) {
    this.show(message, 'error', 4500);
  },
  info(message: string) {
    this.show(message, 'info');
  },
  warning(message: string) {
    this.show(message, 'warning', 4000);
  },
};

const TOAST_STYLES: Record<ToastType, { icon: React.ElementType; classes: string }> = {
  success: { icon: CheckCircle2, classes: 'bg-emerald-600/95 border-emerald-500/50' },
  error: { icon: XCircle, classes: 'bg-red-600/95 border-red-500/50' },
  info: { icon: Info, classes: 'bg-slate-800/95 border-slate-600/50' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-500/95 border-amber-400/50' },
};

const ToastRow: React.FC<{ item: ToastItem; onDismiss: (id: number) => void }> = ({ item, onDismiss }) => {
  const [leaving, setLeaving] = useState(false);

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), 180);
  }, [item.id, onDismiss]);

  useEffect(() => {
    const t = setTimeout(dismiss, item.duration);
    return () => clearTimeout(t);
  }, [dismiss, item.duration]);

  const style = TOAST_STYLES[item.type];
  const Icon = style.icon;

  return (
    <div
      role="status"
      dir="rtl"
      className={`pointer-events-auto flex items-center gap-2.5 max-w-[92vw] sm:max-w-md px-4 py-2.5 rounded-2xl text-white text-[13px] font-medium shadow-2xl border backdrop-blur-md transition-all duration-200 ${
        style.classes
      } ${leaving ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100 animate-in fade-in slide-in-from-bottom-2'}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 leading-relaxed">{item.message}</span>
      <button
        onClick={dismiss}
        aria-label="إغلاق التنبيه"
        className="shrink-0 p-0.5 rounded-lg hover:bg-white/15 transition-colors"
      >
        <span className="sr-only">إغلاق</span>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

export const ToastHost: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((prev) => [...prev.slice(-4), item]);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const handleDismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none" aria-live="polite">
      {items.map((item) => (
        <ToastRow key={item.id} item={item} onDismiss={handleDismiss} />
      ))}
    </div>
  );
};
