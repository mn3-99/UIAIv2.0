// agent/hooks/useGlobalKeybindings.ts
// Raccourcis globaux (doc 13) : Ctrl+L (clear), Ctrl+R (history search),
// Escape (cancel), Tab (complete).

import { useInput } from 'ink';

export interface GlobalActions {
  onClear?: () => void;
  onHistorySearch?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}

export function useGlobalKeybindings(actions: GlobalActions): void {
  useInput((input, key) => {
    const name = (key as { name?: string }).name;
    if (key.ctrl && name === 'l') {
      actions.onClear?.();
    } else if (key.ctrl && name === 'r') {
      actions.onHistorySearch?.();
    } else if (key.escape) {
      actions.onCancel?.();
    } else if (key.tab) {
      actions.onComplete?.();
    }
  });
}
