import { useEffect, useRef } from 'react';

interface HotkeyAction {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  action: () => void;
  description: string;
  preventDefault?: boolean;
  global?: boolean; // if true, works even when focused on input/textarea
}

export function useGlobalHotkeys(hotkeys: HotkeyAction[]) {
  const hotkeysRef = useRef(hotkeys);
  hotkeysRef.current = hotkeys;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      for (const hk of hotkeysRef.current) {
        const keyMatch = hk.key.toLowerCase() === e.key.toLowerCase();
        const ctrlMatch = hk.ctrlKey === undefined || hk.ctrlKey === (e.ctrlKey || e.metaKey);
        const shiftMatch = hk.shiftKey === undefined || hk.shiftKey === e.shiftKey;
        const altMatch = hk.altKey === undefined || hk.altKey === e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (isInput && !hk.global) continue;
          
          if (hk.preventDefault !== false) {
            e.preventDefault();
          }
          hk.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

export const DEFAULT_HOTKEYS = [
  {
    key: 'k',
    ctrlKey: true,
    action: () => { /* Model picker - handled by parent */ },
    description: 'فتح منتقي الموديلات',
    global: true,
  },
  {
    key: 'p',
    ctrlKey: true,
    shiftKey: true,
    action: () => { /* Prompt optimizer */ },
    description: 'تحسين الأمر (Prompt Optimizer)',
    global: true,
  },
  {
    key: 'n',
    ctrlKey: true,
    shiftKey: true,
    action: () => { /* New chat */ },
    description: 'محادثة جديدة',
    global: true,
  },
  {
    key: 'Escape',
    action: () => { /* Close popovers */ },
    description: 'إغلاق النوافذ المنبثقة',
    global: true,
  },
];
