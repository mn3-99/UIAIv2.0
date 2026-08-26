import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Unified modal accessibility: focus trap (Tab/Shift+Tab cycles inside),
 * Escape closes, focus moves into the dialog on open and returns to the
 * previously focused element on close.
 *
 * Usage:
 *   const ref = useModalA11y<HTMLDivElement>(isOpen, onClose);
 *   <div ref={ref} role="dialog" aria-modal="true">...</div>
 */
export function useModalA11y<T extends HTMLElement>(isOpen: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreRef.current = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;

    // Focus the first sensible target inside the dialog.
    const autofocusTarget = root.querySelector<HTMLElement>('[data-autofocus]');
    const firstFocusable = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (autofocusTarget || firstFocusable || root).focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      // Collect visible focusable elements (explicitly typed: generic
      // querySelectorAll on a generic receiver loses inference under strict TS).
      const focusables: HTMLElement[] = [];
      root.querySelectorAll(FOCUSABLE_SELECTOR).forEach((node) => {
        const el = node as HTMLElement;
        if (el.offsetParent !== null || el === document.activeElement) focusables.push(el);
      });
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus?.();
        return;
      }
      const first: HTMLElement = focusables[0];
      const last: HTMLElement = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (!active || active === last || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Restore focus to whatever the user was doing before the dialog opened.
      restoreRef.current?.focus?.();
      restoreRef.current = null;
    };
  }, [isOpen]);

  return ref;
}
