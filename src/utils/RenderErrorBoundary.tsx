import React from 'react';

/**
 * RenderErrorBoundary — حاجز أخطاء عرض
 * يلتقط أي خطأ (مثل React #310) يرميه مكوّن فرعي أثناء عرض محتوى رسالة،
 * فيعرض Fallback نصياً بدل انهيار/تعليق كامل الواجهة، ويسجّل الخطأ للتصحيح.
 */
interface Props { children: React.ReactNode; fallback?: React.ReactNode; onError?: (e: Error) => void; }
interface State { hasError: boolean; message: string; }

export class RenderErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(e: Error): State {
    return { hasError: true, message: e?.message || String(e) };
  }

  componentDidCatch(e: Error) {
    try { console.error('[RenderErrorBoundary]', e); } catch { /* ignore */ }
    this.props.onError?.(e);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="text-xs text-red-500 whitespace-pre-wrap">
          تعذّر عرض هذا الجزء من الرد ({this.state.message}). جرّب إعادة التوليد.
        </div>
      );
    }
    return this.props.children;
  }
}
