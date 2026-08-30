// agent/services/autoDream/config.ts
// Configuration du systeme autoDream (doc 09 : gates).

export const DREAM_CONFIG = {
  timeGateMs: 24 * 60 * 60 * 1000, // >= 24h depuis derniere consolidation
  sessionGate: 5, // >= 5 sessions
  maxIndexLines: 200,
};

export interface ConsolidationState {
  lastConsolidation: number;
  sessionCountSince: number;
}

const STATE_PATH = 'autoDream.state.json';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../../setup';

function statePath(): string {
  return join(configDir(), STATE_PATH);
}

export function loadState(): ConsolidationState {
  const p = statePath();
  if (!existsSync(p)) return { lastConsolidation: 0, sessionCountSince: 0 };
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as ConsolidationState;
  } catch {
    return { lastConsolidation: 0, sessionCountSince: 0 };
  }
}

export function saveState(state: ConsolidationState): void {
  writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

/** Incremente le compteur de sessions (appelle a chaque fin de session). */
export function bumpSessionCount(): ConsolidationState {
  const s = loadState();
  s.sessionCountSince += 1;
  saveState(s);
  return s;
}
