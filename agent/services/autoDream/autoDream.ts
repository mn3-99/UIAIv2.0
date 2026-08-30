// agent/services/autoDream/autoDream.ts
// Moteur de consolidation automatique (doc 09 : runConsolidation + gates).

import { addMemory, loadMemoryContext, readDailyLogs } from '../../memdir/memdir';
import { loadMemories, deleteMemory } from '../../memdir/memoryFile';
import { DREAM_CONFIG, loadState, saveState, bumpSessionCount } from './config';
import { acquireLock, releaseLock } from './consolidationLock';
import { CONSOLIDATE_PROMPT } from './consolidationPrompt';
import type { ApiClient } from '../../services/api';

/** Verifie les gates et lance la consolidation si possible (doc 09). */
export async function maybeConsolidate(api?: ApiClient): Promise<boolean> {
  const state = loadState();
  const now = Date.now();

  // Time gate
  if (now - state.lastConsolidation < DREAM_CONFIG.timeGateMs) return false;
  // Session gate
  if (state.sessionCountSince < DREAM_CONFIG.sessionGate) return false;
  // Lock gate
  if (!acquireLock()) return false;

  try {
    await runConsolidation(api);
    saveState({ lastConsolidation: now, sessionCountSince: 0 });
    return true;
  } finally {
    releaseLock();
  }
}

/** Consolidation (Phases ORIENT / GATHER / CONSOLIDATE / PRUNE). */
async function runConsolidation(api?: ApiClient): Promise<void> {
  const dailyLogs = readDailyLogs(3);
  if (!dailyLogs.trim()) return;

  // Phase 1+2 : orient + gather (sans LLM, on analyse les signaux simples)
  const memoryContext = loadMemoryContext();

  if (!api) return; // consolidation LLM requise pour la phase 3

  // Phase 3 : CONSOLIDATE via le modele
  const prompt = CONSOLIDATE_PROMPT(dailyLogs, memoryContext);
  let parsed: {
    updates?: Array<{ name: string; description: string; type: 'user' | 'feedback' | 'project' | 'reference'; content: string }>;
    creates?: Array<{ name: string; description: string; type: 'user' | 'feedback' | 'project' | 'reference'; content: string }>;
    prune?: string[];
  } = { creates: [] };

  try {
    const resp = await api.chat([
      { role: 'system', content: 'Tu reponds uniquement en JSON valide.' },
      { role: 'user', content: prompt },
    ]);
    const json = (resp.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    parsed = JSON.parse(json);
  } catch {
    return; // echec de consolidation -> on retente plus tard
  }

  for (const u of parsed.updates ?? []) {
    addMemory(u);
  }
  for (const c of parsed.creates ?? []) {
    addMemory(c);
  }
  for (const name of parsed.prune ?? []) {
    deleteMemory(name);
  }
}

/** A appeler a la fin de chaque session (doc 09 : lazy consolidation). */
export async function onSessionEnd(api?: ApiClient): Promise<void> {
  bumpSessionCount();
  // Consolidation paresseuse : seulement si les gates sont satisfaits.
  if (api) {
    void maybeConsolidate(api);
  }
}
