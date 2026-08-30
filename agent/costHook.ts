// agent/costHook.ts
// Affichage du resume de couts en fin de session (doc 12 : costHook).

import { getSessionSummary } from './cost-tracker';

/** Affiche le resume de session sur stderr (non mixe avec la sortie normale). */
export function printSessionSummary(model: string): void {
  try {
    process.stderr.write(`\n${getSessionSummary(model)}\n`);
  } catch {
    /* ignore */
  }
}
