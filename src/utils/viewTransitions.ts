/**
 * View Transitions API helper — انتقالات سلسة بين الحالات
 * =======================================================
 * غلاف آمن لـ document.startViewTransition مع:
 *   • كشف التوفر (Safari/Chrome/Edge)
 *   • احترام prefers-reduced-motion (وقوع فوري بدون انتقال)
 *   • تحديث DOM داخل استدعاء الانتقال مع انتظار إطارين لضمان الرسم.
 */

export function supportsViewTransitions(): boolean {
  try {
    return typeof document !== 'undefined' && typeof (document as any).startViewTransition === 'function';
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Run `update()` — wrapped in a View Transition when the browser supports it
 * and the user hasn't asked to reduce motion. Falls back to a direct call.
 */
export function withViewTransition(update: () => void): void {
  if (!supportsViewTransitions() || prefersReducedMotion()) {
    update();
    return;
  }
  const doc = document as any;
  const vt = doc.startViewTransition(() => new Promise<void>((resolve) => {
    update();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  // Safety: if the transition is interrupted/cancelled we never block anything.
  if (vt?.finished?.catch) vt.finished.catch(() => {});
}
