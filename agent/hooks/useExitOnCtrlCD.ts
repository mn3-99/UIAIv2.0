// agent/hooks/useExitOnCtrlCD.ts
// Fermeture propre sur Ctrl+C / Ctrl+D (doc 13).

import { useInput } from 'ink';

export function useExitOnCtrlCD(onExit: () => void): void {
  useInput((_input, key) => {
    const name = (key as { name?: string }).name;
    if (key.ctrl && (name === 'c' || name === 'd')) {
      onExit();
    }
  });
}
