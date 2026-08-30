// agent/state/onChangeAppState.ts
// Listeners de changement d'etat -> effets secondaires (doc 07).

import type { Store } from './AppStateStore';
import type { AppState } from './AppState';

let prev: Readonly<AppState> | null = null;

/** Effets secondaires sur changement d'etat (doc 07 : onChangeAppState). */
export function attachStateListeners(
  store: Store<AppState>,
  effects: {
    onMessagesChange?: (state: Readonly<AppState>) => void;
    onModelChange?: (model: string) => void;
    onCostChange?: (state: Readonly<AppState>) => void;
  },
): () => void {
  prev = store.getState();
  return store.subscribe((state) => {
    if (prev === null) {
      prev = state;
      return;
    }
    if (state.messages !== prev.messages) effects.onMessagesChange?.(state);
    if (state.currentModel !== prev.currentModel) effects.onModelChange?.(state.currentModel);
    if (state.costState !== prev.costState) effects.onCostChange?.(state);
    prev = state;
  });
}

/** Met a jour le titre du terminal via OSC 0 (doc 07). */
export function setTerminalTitle(title: string): void {
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
}
