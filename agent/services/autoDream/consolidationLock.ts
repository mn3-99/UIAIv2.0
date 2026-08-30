// agent/services/autoDream/consolidationLock.ts
// Verrou d'execution (doc 09 : evite les consolidations concurrentes).

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from '../../setup';

const LOCK_PATH = join(configDir(), 'autoDream.lock');

/** Tente d'acquerir le verrou. Retourne true si acquis. */
export function acquireLock(): boolean {
  if (existsSync(LOCK_PATH)) {
    // Verrou trop vieux (> 10 min) -> on le considere stale
    try {
      const ts = Number(readFileSync(LOCK_PATH, 'utf-8'));
      if (Date.now() - ts < 10 * 60 * 1000) return false;
    } catch {
      /* ignore */
    }
  }
  writeFileSync(LOCK_PATH, String(Date.now()));
  return true;
}

export function releaseLock(): void {
  if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
}
