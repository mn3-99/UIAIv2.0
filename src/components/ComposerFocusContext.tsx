import { createContext, useCallback, useContext, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ComposerFocusContext — replaces fragile document.getElementById('main_input')
// lookups. The composer registers its textarea (or a focus+caret helper) once;
// anything that needs to focus the composer (starter chips, plugin actions)
// calls focusComposer(). Same behavior: focus + caret to end.
// ─────────────────────────────────────────────────────────────────────────────

interface ComposerFocusApi {
  /** Register a focus helper from the composer. Returns an unregister fn. */
  registerTextarea: (fn: (() => void) | null) => () => void;
  /** Focus the composer and place the caret at the end. */
  focusComposer: () => void;
}

export const ComposerFocusContext = createContext<ComposerFocusApi | null>(null);

export function useComposerFocus(): ComposerFocusApi {
  const ctx = useContext(ComposerFocusContext);
  if (!ctx) {
    // No provider (shouldn't happen — mounted in main.tsx): degrade to a no-op.
    return {
      registerTextarea: () => () => {},
      focusComposer: () => {},
    };
  }
  return ctx;
}

/** Provider that owns the registered focus helper. */
export function ComposerFocusProvider({ children }: { children: React.ReactNode }) {
  const focusRef = useRef<(() => void) | null>(null);

  const registerTextarea = useCallback((fn: (() => void) | null) => () => {
    focusRef.current = fn;
    return () => { if (focusRef.current === fn) focusRef.current = null; };
  }, []);

  const focusComposer = useCallback(() => {
    focusRef.current?.();
  }, []);

  return (
    <ComposerFocusContext.Provider value={{ registerTextarea, focusComposer }}>
      {children}
    </ComposerFocusContext.Provider>
  );
}
