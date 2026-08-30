// agent/hooks/useArrowKeyHistory.ts
// Navigation dans l'historique avec les fleches (doc 13).
// Reutilisable par la zone de saisie.

import { useState } from 'react';

export function useArrowKeyHistory(initialHistory: string[] = []) {
  const [history, setHistory] = useState<string[]>(initialHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  function push(value: string): void {
    setHistory((h) => [...h, value]);
    setHistoryIndex(-1);
    setDraft('');
  }

  function navigateUp(): string | null {
    if (history.length === 0) return null;
    const next = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
    setHistoryIndex(next);
    return history[next];
  }

  function navigateDown(): string | null {
    if (historyIndex === -1) return null;
    const next = historyIndex + 1;
    if (next >= history.length) {
      setHistoryIndex(-1);
      return draft;
    }
    setHistoryIndex(next);
    return history[next];
  }

  return { history, push, navigateUp, navigateDown, historyIndex, setDraft };
}
